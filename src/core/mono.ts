/**
 * Out-of-process Mono runtime traversal.
 *
 * Hearthstone is a Mono/Unity process, so the authoritative Battlegrounds rating
 * lives in managed memory rather than in any log file. This module walks the Mono
 * runtime structures from the outside — the same technique HearthMirror uses for
 * Hearthstone Deck Tracker.
 *
 * Struct offsets shift between Mono builds, so nothing here is hardcoded blindly:
 * every offset is *calibrated* at runtime by probing candidates and validating
 * that the resulting reads produce known-good data (for example, that the domain's
 * assembly list actually contains `Assembly-CSharp`). A mis-calibrated offset then
 * fails loudly instead of silently yielding a garbage rating.
 */

import { readExports, resolveRipRelativeGlobal } from './pe'
import {
  isPlausiblePointer,
  readCStringAt,
  readI32,
  readPtr,
  type MemoryReader
} from './processMemory'

export const ROOT_DOMAIN_EXPORT = 'mono_get_root_domain'
export const TARGET_ASSEMBLY = 'Assembly-CSharp'

/** GSList is `{ gpointer data; GSList *next; }` on every platform Mono supports. */
const GSLIST_DATA = 0n
const GSLIST_NEXT = 8n

/**
 * Candidate byte offsets of `MonoDomain::domain_assemblies`. Mono has moved this
 * field across releases; we probe rather than pin. Ordered by observed likelihood.
 */
const DOMAIN_ASSEMBLIES_CANDIDATES = [0xc8, 0xa0, 0xb0, 0xd0, 0xe0, 0x90, 0xa8, 0xb8, 0xc0]

/** Candidate offsets of `MonoAssembly::aname.name` (the `const char *`). */
const ASSEMBLY_NAME_CANDIDATES = [0x10, 0x18, 0x08, 0x20, 0x28]

/** Candidate offsets of `MonoAssembly::image`. */
const ASSEMBLY_IMAGE_CANDIDATES = [0x60, 0x58, 0x50, 0x68, 0x48, 0x70]

/** Candidate offsets of the `char *` name fields on `MonoImage`. */
const IMAGE_NAME_CANDIDATES = [0x18, 0x10, 0x20, 0x28, 0x08, 0x30]

/** A domain holds a bounded number of assemblies; stop runaway list walks. */
const MAX_ASSEMBLIES = 512

import type { MonoStructOffsets } from './types'

export interface MonoAssemblyInfo {
  address: bigint
  name: string
}

export interface MonoRuntime {
  monoModuleBase: bigint
  rootDomain: bigint
  offsets: MonoStructOffsets
  assemblies: MonoAssemblyInfo[]
  /** MonoImage* for `Assembly-CSharp`. */
  assemblyCSharpImage: bigint
  imageName: string
}

export type MonoProbeFailure =
  | 'no-mono-module'
  | 'no-export-table'
  | 'no-root-domain-export'
  | 'no-root-domain-global'
  | 'no-root-domain'
  | 'no-assembly-list'
  | 'no-assembly-csharp'
  | 'no-assembly-image'

export interface MonoProbeResult {
  runtime: MonoRuntime | null
  failure: MonoProbeFailure | null
  /** Human-readable trace of what each calibration step found. */
  diagnostics: string[]
}

/** Walks a GSList, yielding each `data` pointer. */
function gslistValues(reader: MemoryReader, head: bigint, limit = MAX_ASSEMBLIES): bigint[] {
  const out: bigint[] = []
  const seen = new Set<bigint>()
  let node = head
  while (isPlausiblePointer(node) && out.length < limit && !seen.has(node)) {
    seen.add(node)
    const data = readPtr(reader, node + GSLIST_DATA)
    if (data != null && isPlausiblePointer(data)) out.push(data)
    const next = readPtr(reader, node + GSLIST_NEXT)
    if (next == null || next === 0n) break
    node = next
  }
  return out
}

function looksLikeAssemblyName(value: string): boolean {
  if (value.length === 0 || value.length > 128) return false
  return /^[A-Za-z0-9._+-]+$/.test(value)
}

/**
 * Jointly calibrates `domain_assemblies` and `aname.name`.
 *
 * A candidate pair is accepted only when the resulting assembly list contains
 * `Assembly-CSharp` — the marker that proves we are reading a real Mono domain
 * belonging to a Unity game rather than coincidental pointer-shaped bytes.
 */
function calibrateAssemblies(
  reader: MemoryReader,
  rootDomain: bigint,
  diagnostics: string[]
): { domainAssemblies: number; assemblyName: number; assemblies: MonoAssemblyInfo[] } | null {
  for (const domainOffset of DOMAIN_ASSEMBLIES_CANDIDATES) {
    const head = readPtr(reader, rootDomain + BigInt(domainOffset))
    if (head == null || !isPlausiblePointer(head)) continue
    const nodes = gslistValues(reader, head)
    if (nodes.length === 0) continue

    for (const nameOffset of ASSEMBLY_NAME_CANDIDATES) {
      const assemblies: MonoAssemblyInfo[] = []
      for (const address of nodes) {
        const name = readCStringAt(reader, address + BigInt(nameOffset), 128)
        if (name && looksLikeAssemblyName(name)) assemblies.push({ address, name })
      }
      // Require most entries to resolve, so a single lucky string cannot pass.
      if (assemblies.length < Math.max(2, Math.floor(nodes.length / 2))) continue
      if (!assemblies.some((a) => a.name === TARGET_ASSEMBLY)) continue
      diagnostics.push(
        `assemblies: domain+0x${domainOffset.toString(16)} name+0x${nameOffset.toString(16)} -> ${assemblies.length} entries`
      )
      return { domainAssemblies: domainOffset, assemblyName: nameOffset, assemblies }
    }
  }
  return null
}

/**
 * Calibrates `MonoAssembly::image` plus a readable `MonoImage` name field by
 * requiring the image to identify itself as Assembly-CSharp.
 */
function calibrateImage(
  reader: MemoryReader,
  assembly: bigint,
  diagnostics: string[]
): { assemblyImage: number; imageName: number; image: bigint; name: string } | null {
  for (const imageOffset of ASSEMBLY_IMAGE_CANDIDATES) {
    const image = readPtr(reader, assembly + BigInt(imageOffset))
    if (image == null || !isPlausiblePointer(image)) continue
    for (const nameOffset of IMAGE_NAME_CANDIDATES) {
      const name = readCStringAt(reader, image + BigInt(nameOffset), 256)
      if (!name || !name.includes(TARGET_ASSEMBLY)) continue
      diagnostics.push(
        `image: assembly+0x${imageOffset.toString(16)} name+0x${nameOffset.toString(16)} -> ${name}`
      )
      return { assemblyImage: imageOffset, imageName: nameOffset, image, name }
    }
  }
  return null
}

/**
 * Resolves the Mono root domain and calibrates the struct offsets needed to reach
 * `Assembly-CSharp`.
 *
 * `monoModuleBase` must be the load address of the module exporting
 * `mono_get_root_domain` (`mono-2.0-bdwgc.dll` for current Hearthstone builds).
 */
export function probeMonoRuntime(
  reader: MemoryReader,
  monoModuleBase: bigint,
  monoModuleSize = 0
): MonoProbeResult {
  const diagnostics: string[] = []

  if (!isPlausiblePointer(monoModuleBase)) {
    return { runtime: null, failure: 'no-mono-module', diagnostics }
  }

  const exports = readExports(reader, monoModuleBase)
  if (!exports) return { runtime: null, failure: 'no-export-table', diagnostics }

  const rootDomainFn = exports.find(ROOT_DOMAIN_EXPORT)
  if (rootDomainFn == null) return { runtime: null, failure: 'no-root-domain-export', diagnostics }
  diagnostics.push(`${ROOT_DOMAIN_EXPORT} @ 0x${rootDomainFn.toString(16)}`)

  const rootDomainGlobal = resolveRipRelativeGlobal(reader, rootDomainFn, {
    base: monoModuleBase,
    size: monoModuleSize
  })
  if (rootDomainGlobal == null) return { runtime: null, failure: 'no-root-domain-global', diagnostics }
  diagnostics.push(`root domain global @ 0x${rootDomainGlobal.toString(16)}`)

  const rootDomain = readPtr(reader, rootDomainGlobal)
  if (rootDomain == null || !isPlausiblePointer(rootDomain)) {
    return { runtime: null, failure: 'no-root-domain', diagnostics }
  }
  diagnostics.push(`root domain @ 0x${rootDomain.toString(16)}`)

  const calibrated = calibrateAssemblies(reader, rootDomain, diagnostics)
  if (!calibrated) return { runtime: null, failure: 'no-assembly-list', diagnostics }

  const target = calibrated.assemblies.find((a) => a.name === TARGET_ASSEMBLY)
  if (!target) return { runtime: null, failure: 'no-assembly-csharp', diagnostics }

  const imageInfo = calibrateImage(reader, target.address, diagnostics)
  if (!imageInfo) return { runtime: null, failure: 'no-assembly-image', diagnostics }

  return {
    runtime: {
      monoModuleBase,
      rootDomain,
      offsets: {
        domainAssemblies: calibrated.domainAssemblies,
        assemblyName: calibrated.assemblyName,
        assemblyImage: imageInfo.assemblyImage,
        imageName: imageInfo.imageName
      },
      assemblies: calibrated.assemblies,
      assemblyCSharpImage: imageInfo.image,
      imageName: imageInfo.name
    },
    failure: null,
    diagnostics
  }
}

/** Reads a Mono `System.String` (length-prefixed UTF-16 at a fixed header offset). */
export function readMonoString(reader: MemoryReader, address: bigint): string | null {
  if (!isPlausiblePointer(address)) return null
  const length = readI32(reader, address + 0x10n)
  if (length == null || length < 0 || length > 4096) return null
  if (length === 0) return ''
  const buf = reader.read(address + 0x14n, length * 2)
  return buf ? buf.toString('utf16le') : null
}


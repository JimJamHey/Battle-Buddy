/**
 * Minimal PE export-table reader.
 *
 * We need exactly one thing from `mono-2.0-bdwgc.dll`: the address of
 * `mono_get_root_domain`. Rather than hardcoding an offset that shifts with
 * every Hearthstone patch, we parse the module's export directory out of the
 * live image the same way the loader would.
 */

import {
  isPlausiblePointer,
  readAtMost,
  readCString,
  readU16,
  readU32,
  type MemoryReader
} from './processMemory'

const IMAGE_DOS_SIGNATURE = 0x5a4d // 'MZ'
const IMAGE_NT_SIGNATURE = 0x00004550 // 'PE\0\0'
const PE32_MAGIC = 0x10b
const PE32PLUS_MAGIC = 0x20b

const E_LFANEW_OFFSET = 0x3c
const OPTIONAL_HEADER_OFFSET = 0x18
/** Export directory is data-directory entry 0; it sits past the optional header body. */
const DATA_DIRECTORY_OFFSET_PE32 = 0x60
const DATA_DIRECTORY_OFFSET_PE32PLUS = 0x70

const EXPORT_NUMBER_OF_NAMES = 0x18
const EXPORT_ADDRESS_OF_FUNCTIONS = 0x1c
const EXPORT_ADDRESS_OF_NAMES = 0x20
const EXPORT_ADDRESS_OF_NAME_ORDINALS = 0x24

/** Guards against a bogus header sending us into a multi-million iteration loop. */
const MAX_EXPORTS = 20000

export interface ExportLookup {
  /** Absolute address of the named export, or null when absent. */
  find(name: string): bigint | null
  names(): string[]
}

/**
 * Parses the export directory of the module loaded at `moduleBase`.
 * Returns null when the image headers do not look like a PE.
 */
export function readExports(reader: MemoryReader, moduleBase: bigint): ExportLookup | null {
  if (!isPlausiblePointer(moduleBase)) return null

  const dosMagic = readU16(reader, moduleBase)
  if (dosMagic !== IMAGE_DOS_SIGNATURE) return null

  const lfanew = readU32(reader, moduleBase + BigInt(E_LFANEW_OFFSET))
  if (lfanew == null || lfanew <= 0 || lfanew > 0x1000) return null

  const ntBase = moduleBase + BigInt(lfanew)
  if (readU32(reader, ntBase) !== IMAGE_NT_SIGNATURE) return null

  const optionalBase = ntBase + BigInt(OPTIONAL_HEADER_OFFSET)
  const magic = readU16(reader, optionalBase)
  if (magic !== PE32_MAGIC && magic !== PE32PLUS_MAGIC) return null

  const dataDirOffset = magic === PE32PLUS_MAGIC ? DATA_DIRECTORY_OFFSET_PE32PLUS : DATA_DIRECTORY_OFFSET_PE32
  const exportRva = readU32(reader, optionalBase + BigInt(dataDirOffset))
  if (exportRva == null || exportRva === 0) return null

  const exportBase = moduleBase + BigInt(exportRva)
  const nameCount = readU32(reader, exportBase + BigInt(EXPORT_NUMBER_OF_NAMES))
  const functionsRva = readU32(reader, exportBase + BigInt(EXPORT_ADDRESS_OF_FUNCTIONS))
  const namesRva = readU32(reader, exportBase + BigInt(EXPORT_ADDRESS_OF_NAMES))
  const ordinalsRva = readU32(reader, exportBase + BigInt(EXPORT_ADDRESS_OF_NAME_ORDINALS))
  if (nameCount == null || functionsRva == null || namesRva == null || ordinalsRva == null) return null
  if (nameCount <= 0 || nameCount > MAX_EXPORTS) return null

  const namesBase = moduleBase + BigInt(namesRva)
  const ordinalsBase = moduleBase + BigInt(ordinalsRva)
  const functionsBase = moduleBase + BigInt(functionsRva)

  const resolveAt = (index: number): { name: string; address: bigint } | null => {
    const nameRva = readU32(reader, namesBase + BigInt(index * 4))
    if (nameRva == null || nameRva === 0) return null
    const name = readCString(reader, moduleBase + BigInt(nameRva), 128)
    if (!name) return null
    const ordinal = readU16(reader, ordinalsBase + BigInt(index * 2))
    if (ordinal == null) return null
    const functionRva = readU32(reader, functionsBase + BigInt(ordinal * 4))
    if (functionRva == null || functionRva === 0) return null
    return { name, address: moduleBase + BigInt(functionRva) }
  }

  const cache = new Map<string, bigint>()
  let scanned = 0

  const scanAll = (): void => {
    while (scanned < nameCount) {
      const entry = resolveAt(scanned)
      scanned++
      if (entry && !cache.has(entry.name)) cache.set(entry.name, entry.address)
    }
  }

  return {
    find(name: string): bigint | null {
      const hit = cache.get(name)
      if (hit != null) return hit
      // Exports are sorted by name, but a linear scan of a few thousand entries is
      // cheap and immune to sorting assumptions; results are memoized.
      while (scanned < nameCount) {
        const entry = resolveAt(scanned)
        scanned++
        if (!entry) continue
        if (!cache.has(entry.name)) cache.set(entry.name, entry.address)
        if (entry.name === name) return entry.address
      }
      return null
    },
    names(): string[] {
      scanAll()
      return [...cache.keys()]
    }
  }
}

/**
 * Resolves the global that `mono_get_root_domain` returns.
 *
 * The x64 body is a two-instruction accessor:
 *   48 8B 05 <disp32>   mov rax, [rip + disp32]
 *   C3                  ret
 * so the domain pointer lives at (instruction end + disp32). We scan a short
 * window because some builds prepend a few bytes of prologue or CET padding.
 */
export function resolveRipRelativeGlobal(
  reader: MemoryReader,
  functionAddress: bigint,
  window = 32
): bigint | null {
  if (!isPlausiblePointer(functionAddress)) return null
  const code = readAtMost(reader, functionAddress, window)
  if (!code) return null

  for (let i = 0; i + 7 <= code.length; i++) {
    // REX.W + MOV r64, r/m64 with ModRM selecting RIP-relative addressing of RAX.
    if (code[i] !== 0x48 || code[i + 1] !== 0x8b || code[i + 2] !== 0x05) continue
    const disp = code.readInt32LE(i + 3)
    const instructionEnd = functionAddress + BigInt(i + 7)
    const target = instructionEnd + BigInt(disp)
    if (isPlausiblePointer(target)) return target
  }
  return null
}

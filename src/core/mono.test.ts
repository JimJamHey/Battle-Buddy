import { describe, expect, it } from 'vitest'
import { probeMonoRuntime, readMonoString, TARGET_ASSEMBLY } from './mono'
import { readExports, resolveRipRelativeGlobal } from './pe'
import { cachedReader, readCString, type MemoryReader } from './processMemory'

/**
 * Sparse, writable stand-in for a remote address space. Lets us assemble a
 * realistic Mono/PE layout and assert the walker finds its way through without a
 * running Hearthstone.
 */
class FakeMemory implements MemoryReader {
  private readonly bytes = new Map<bigint, number>()
  /** Real address spaces are page-granular; model that so reads fail the way they would. */
  private readonly pages = new Set<bigint>()
  private static readonly PAGE = 0x1000n

  private mapRange(address: bigint, length: number): void {
    const first = address / FakeMemory.PAGE
    const last = (address + BigInt(Math.max(0, length - 1))) / FakeMemory.PAGE
    for (let page = first; page <= last; page++) this.pages.add(page)
  }

  private isMapped(address: bigint): boolean {
    return this.pages.has(address / FakeMemory.PAGE)
  }

  write(address: bigint, buf: Buffer): void {
    this.mapRange(address, buf.length)
    for (let i = 0; i < buf.length; i++) this.bytes.set(address + BigInt(i), buf[i])
  }

  writeU16(address: bigint, value: number): void {
    const b = Buffer.alloc(2)
    b.writeUInt16LE(value)
    this.write(address, b)
  }

  writeU32(address: bigint, value: number): void {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(value >>> 0)
    this.write(address, b)
  }

  writeI32(address: bigint, value: number): void {
    const b = Buffer.alloc(4)
    b.writeInt32LE(value)
    this.write(address, b)
  }

  writePtr(address: bigint, value: bigint): void {
    const b = Buffer.alloc(8)
    b.writeBigUInt64LE(value)
    this.write(address, b)
  }

  writeCString(address: bigint, value: string): void {
    this.write(address, Buffer.concat([Buffer.from(value, 'latin1'), Buffer.from([0])]))
  }

  read(address: bigint, length: number): Buffer | null {
    const out = Buffer.alloc(length)
    for (let i = 0; i < length; i++) {
      const at = address + BigInt(i)
      if (!this.isMapped(at)) return null
      out[i] = this.bytes.get(at) ?? 0
    }
    return out
  }
}

const MODULE_BASE = 0x7ff8_0000_0000n
const PE_HEADER_RVA = 0x100
const EXPORT_RVA = 0x1000
const ROOT_DOMAIN_FN_RVA = 0x2000
const ROOT_DOMAIN_GLOBAL = MODULE_BASE + 0x3000n

const DOMAIN = 0x1_0000_0000n
const ASSEMBLY_CSHARP = 0x1_0001_0000n
const ASSEMBLY_MSCORLIB = 0x1_0002_0000n
const IMAGE_CSHARP = 0x1_0003_0000n
const IMAGE_MSCORLIB = 0x1_0004_0000n
const STRINGS = 0x1_0005_0000n

const DOMAIN_ASSEMBLIES_OFFSET = 0xc8
const ASSEMBLY_NAME_OFFSET = 0x10
const ASSEMBLY_IMAGE_OFFSET = 0x60
const IMAGE_NAME_OFFSET = 0x18

/** Builds a PE image whose export table exposes the named functions. */
function writePeExports(mem: FakeMemory, exports: Array<{ name: string; rva: number }>): void {
  mem.writeU16(MODULE_BASE, 0x5a4d) // MZ
  mem.writeU32(MODULE_BASE + 0x3cn, PE_HEADER_RVA)

  const nt = MODULE_BASE + BigInt(PE_HEADER_RVA)
  mem.writeU32(nt, 0x00004550) // PE\0\0
  const optional = nt + 0x18n
  mem.writeU16(optional, 0x20b) // PE32+
  mem.writeU32(optional + 0x70n, EXPORT_RVA) // export data directory

  const exportBase = MODULE_BASE + BigInt(EXPORT_RVA)
  const functionsRva = EXPORT_RVA + 0x100
  const namesRva = EXPORT_RVA + 0x200
  const ordinalsRva = EXPORT_RVA + 0x300
  const stringsRva = EXPORT_RVA + 0x400

  mem.writeU32(optional + 0x74n, 0x1000) // export data directory size
  mem.writeU32(exportBase + 0x14n, exports.length) // NumberOfFunctions
  mem.writeU32(exportBase + 0x18n, exports.length) // NumberOfNames
  mem.writeU32(exportBase + 0x1cn, functionsRva)
  mem.writeU32(exportBase + 0x20n, namesRva)
  mem.writeU32(exportBase + 0x24n, ordinalsRva)

  let stringCursor = stringsRva
  exports.forEach((entry, i) => {
    mem.writeU32(MODULE_BASE + BigInt(functionsRva + i * 4), entry.rva)
    mem.writeU32(MODULE_BASE + BigInt(namesRva + i * 4), stringCursor)
    mem.writeU16(MODULE_BASE + BigInt(ordinalsRva + i * 2), i)
    mem.writeCString(MODULE_BASE + BigInt(stringCursor), entry.name)
    stringCursor += entry.name.length + 1
  })
}

/** Emits `mov rax, [rip+disp32]; ret` pointing at ROOT_DOMAIN_GLOBAL. */
function writeRootDomainAccessor(mem: FakeMemory): void {
  const fn = MODULE_BASE + BigInt(ROOT_DOMAIN_FN_RVA)
  const instructionEnd = fn + 7n
  const disp = Number(ROOT_DOMAIN_GLOBAL - instructionEnd)
  const code = Buffer.alloc(8)
  code[0] = 0x48
  code[1] = 0x8b
  code[2] = 0x05
  code.writeInt32LE(disp, 3)
  code[7] = 0xc3
  mem.write(fn, code)
}

function buildRuntime(): FakeMemory {
  const mem = new FakeMemory()

  writePeExports(mem, [
    { name: 'mono_assembly_get_image', rva: 0x2100 },
    { name: 'mono_get_root_domain', rva: ROOT_DOMAIN_FN_RVA },
    { name: 'mono_thread_attach', rva: 0x2200 }
  ])
  writeRootDomainAccessor(mem)
  mem.writePtr(ROOT_DOMAIN_GLOBAL, DOMAIN)

  // Assembly name/path strings.
  const nameCSharp = STRINGS
  const nameMscorlib = STRINGS + 0x40n
  const pathCSharp = STRINGS + 0x80n
  const pathMscorlib = STRINGS + 0x140n
  mem.writeCString(nameCSharp, TARGET_ASSEMBLY)
  mem.writeCString(nameMscorlib, 'mscorlib')
  mem.writeCString(pathCSharp, 'C:\\Hearthstone\\Managed\\Assembly-CSharp.dll')
  mem.writeCString(pathMscorlib, 'C:\\Hearthstone\\Managed\\mscorlib.dll')

  // GSList: head -> Assembly-CSharp -> mscorlib -> null
  const node0 = 0x1_0006_0000n
  const node1 = 0x1_0006_0100n
  mem.writePtr(DOMAIN + BigInt(DOMAIN_ASSEMBLIES_OFFSET), node0)
  mem.writePtr(node0, ASSEMBLY_CSHARP)
  mem.writePtr(node0 + 8n, node1)
  mem.writePtr(node1, ASSEMBLY_MSCORLIB)
  mem.writePtr(node1 + 8n, 0n)

  mem.writePtr(ASSEMBLY_CSHARP + BigInt(ASSEMBLY_NAME_OFFSET), nameCSharp)
  mem.writePtr(ASSEMBLY_CSHARP + BigInt(ASSEMBLY_IMAGE_OFFSET), IMAGE_CSHARP)
  mem.writePtr(ASSEMBLY_MSCORLIB + BigInt(ASSEMBLY_NAME_OFFSET), nameMscorlib)
  mem.writePtr(ASSEMBLY_MSCORLIB + BigInt(ASSEMBLY_IMAGE_OFFSET), IMAGE_MSCORLIB)

  mem.writePtr(IMAGE_CSHARP + BigInt(IMAGE_NAME_OFFSET), pathCSharp)
  mem.writePtr(IMAGE_MSCORLIB + BigInt(IMAGE_NAME_OFFSET), pathMscorlib)

  return mem
}

describe('pe export table', () => {
  it('resolves exported function addresses by name', () => {
    const mem = buildRuntime()
    const exports = readExports(mem, MODULE_BASE)
    expect(exports).not.toBeNull()
    expect(exports?.find('mono_get_root_domain')).toBe(MODULE_BASE + BigInt(ROOT_DOMAIN_FN_RVA))
    expect(exports?.find('mono_thread_attach')).toBe(MODULE_BASE + 0x2200n)
  })

  it('returns null for a name that is not exported', () => {
    const mem = buildRuntime()
    expect(readExports(mem, MODULE_BASE)?.find('mono_nope')).toBeNull()
  })

  it('rejects a module whose DOS header is missing', () => {
    const mem = new FakeMemory()
    mem.writeU32(MODULE_BASE, 0)
    expect(readExports(mem, MODULE_BASE)).toBeNull()
  })

  it('does not return forwarded exports as code addresses', () => {
    const mem = new FakeMemory()
    // Point the export at an RVA inside the export directory itself, which marks a
    // forwarder string like "NTDLL.RtlFoo" rather than a function.
    writePeExports(mem, [{ name: 'mono_get_root_domain', rva: EXPORT_RVA + 0x500 }])
    expect(readExports(mem, MODULE_BASE)?.find('mono_get_root_domain')).toBeNull()
  })
})

describe('resolveRipRelativeGlobal', () => {
  it('decodes mov rax,[rip+disp32] to the global it reads', () => {
    const mem = buildRuntime()
    const fn = MODULE_BASE + BigInt(ROOT_DOMAIN_FN_RVA)
    expect(resolveRipRelativeGlobal(mem, fn)).toBe(ROOT_DOMAIN_GLOBAL)
  })

  it('returns null when the accessor pattern is absent', () => {
    const mem = new FakeMemory()
    mem.write(MODULE_BASE + 0x5000n, Buffer.alloc(32, 0x90))
    expect(resolveRipRelativeGlobal(mem, MODULE_BASE + 0x5000n)).toBeNull()
  })

  it('ignores a 48 8B 05 sequence that is not followed by ret', () => {
    const mem = new FakeMemory()
    const fn = MODULE_BASE + 0x6000n
    const code = Buffer.alloc(32, 0x90)
    code[0] = 0x48
    code[1] = 0x8b
    code[2] = 0x05
    code.writeInt32LE(0x100, 3)
    code[7] = 0x90 // nop, not ret — this is mid-instruction noise, not the accessor
    mem.write(fn, code)
    expect(resolveRipRelativeGlobal(mem, fn)).toBeNull()
  })

  it('rejects a target that falls outside the owning module', () => {
    const mem = buildRuntime()
    const fn = MODULE_BASE + BigInt(ROOT_DOMAIN_FN_RVA)
    // The real global is at +0x3000, so a 0x1000-byte module cannot contain it.
    expect(resolveRipRelativeGlobal(mem, fn, { base: MODULE_BASE, size: 0x1000 })).toBeNull()
    expect(resolveRipRelativeGlobal(mem, fn, { base: MODULE_BASE, size: 0x8000 })).toBe(
      ROOT_DOMAIN_GLOBAL
    )
  })
})

describe('cachedReader', () => {
  it('refuses to fabricate bytes when a page read comes back short', () => {
    const short: MemoryReader = {
      read(_address, length) {
        // Mimics a reader that honours the request size only partially.
        return Buffer.alloc(Math.min(length, 8))
      }
    }
    expect(cachedReader(short).read(0x1000n, 64)).toBeNull()
  })

  it('serves a read spanning three pages from the underlying reader', () => {
    const backing = Buffer.alloc(0x4000)
    for (let i = 0; i < backing.length; i++) backing[i] = i & 0xff
    const inner: MemoryReader = {
      read(address, length) {
        const start = Number(address)
        if (start < 0 || start + length > backing.length) return null
        return backing.subarray(start, start + length)
      }
    }
    const reader = cachedReader(inner)
    const got = reader.read(0xffen, 0x2004)
    expect(got).not.toBeNull()
    expect(got).toEqual(backing.subarray(0xffe, 0xffe + 0x2004))
  })

  it('propagates a failed read as null rather than zeros', () => {
    const inner: MemoryReader = { read: () => null }
    expect(cachedReader(inner).read(0x1000n, 16)).toBeNull()
  })
})

describe('probeMonoRuntime', () => {
  it('calibrates offsets and reaches Assembly-CSharp', () => {
    const result = probeMonoRuntime(buildRuntime(), MODULE_BASE)
    expect(result.failure).toBeNull()
    const runtime = result.runtime
    expect(runtime).not.toBeNull()
    expect(runtime?.rootDomain).toBe(DOMAIN)
    expect(runtime?.offsets.domainAssemblies).toBe(DOMAIN_ASSEMBLIES_OFFSET)
    expect(runtime?.offsets.assemblyName).toBe(ASSEMBLY_NAME_OFFSET)
    expect(runtime?.offsets.assemblyImage).toBe(ASSEMBLY_IMAGE_OFFSET)
    expect(runtime?.assemblyCSharpImage).toBe(IMAGE_CSHARP)
    expect(runtime?.assemblies.map((a) => a.name)).toContain('mscorlib')
  })

  it('works through the page cache wrapper', () => {
    const result = probeMonoRuntime(cachedReader(buildRuntime()), MODULE_BASE)
    expect(result.failure).toBeNull()
    expect(result.runtime?.assemblyCSharpImage).toBe(IMAGE_CSHARP)
  })

  it('reports the failing stage instead of guessing', () => {
    const mem = buildRuntime()
    // Point the domain's assembly list at unmapped memory.
    mem.writePtr(DOMAIN + BigInt(DOMAIN_ASSEMBLIES_OFFSET), 0x9n)
    const result = probeMonoRuntime(mem, MODULE_BASE)
    expect(result.runtime).toBeNull()
    expect(result.failure).toBe('no-assembly-list')
  })

  it('fails cleanly when the module has no mono exports', () => {
    const mem = new FakeMemory()
    writePeExports(mem, [{ name: 'malloc', rva: 0x2000 }])
    const result = probeMonoRuntime(mem, MODULE_BASE)
    expect(result.failure).toBe('no-root-domain-export')
  })

  it('does not accept a domain whose assemblies lack Assembly-CSharp', () => {
    const mem = buildRuntime()
    mem.writeCString(STRINGS, 'SomeOtherAssembly')
    const result = probeMonoRuntime(mem, MODULE_BASE)
    expect(result.runtime).toBeNull()
    expect(result.failure).toBe('no-assembly-list')
  })
})

describe('managed value reads', () => {
  it('reads a length-prefixed mono string', () => {
    const mem = new FakeMemory()
    const str = 0x2_0000_0000n
    mem.writeI32(str + 0x10n, 5)
    mem.write(str + 0x14n, Buffer.from('Hello', 'utf16le'))
    expect(readMonoString(mem, str)).toBe('Hello')
  })

  it('rejects an implausible string length', () => {
    const mem = new FakeMemory()
    const str = 0x2_0000_0000n
    mem.writeI32(str + 0x10n, 1_000_000)
    expect(readMonoString(mem, str)).toBeNull()
  })

  it('treats non-printable bytes as a failed c-string read', () => {
    const mem = new FakeMemory()
    mem.write(0x3_0000_0000n, Buffer.from([0x01, 0x02, 0x00]))
    expect(readCString(mem, 0x3_0000_0000n)).toBeNull()
  })
})

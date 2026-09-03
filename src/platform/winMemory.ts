/**
 * Read-only access to another process's address space on Windows.
 *
 * This is the transport the Mono traversal in `src/core/mono.ts` runs on. It only
 * ever opens the target with query + read rights: nothing here writes to, injects
 * into, or otherwise modifies Hearthstone.
 */

import { createRequire } from 'node:module'
import type { MemoryReader } from '../core/processMemory'

const require = createRequire(import.meta.url)

type Koffi = typeof import('koffi')

const PROCESS_QUERY_INFORMATION = 0x0400
const PROCESS_VM_READ = 0x0010
const LIST_MODULES_ALL = 0x03

/** ReadProcessMemory rejects oversized requests; chunking keeps calls predictable. */
const MAX_READ = 0x10000

export interface ProcessModule {
  base: bigint
  size: number
  path: string
  name: string
}

interface Native {
  koffi: Koffi
  OpenProcess: (access: number, inherit: number, pid: number) => unknown
  CloseHandle: (handle: unknown) => number
  ReadProcessMemory: (
    handle: unknown,
    address: bigint,
    buffer: Buffer,
    size: number,
    read: { value: number }
  ) => number
  EnumProcessModulesEx: (
    handle: unknown,
    modules: (bigint | number)[],
    cb: number,
    needed: { value: number },
    filter: number
  ) => number
  GetModuleFileNameExW: (handle: unknown, module: bigint | number, name: Buffer, size: number) => number
  GetModuleInformation: (
    handle: unknown,
    module: bigint | number,
    info: { lpBaseOfDll: bigint; SizeOfImage: number; EntryPoint: bigint },
    cb: number
  ) => number
  IsWow64Process: (handle: unknown, wow64: { value: number }) => number
  moduleInfoSize: number
}

let native: Native | null = null

function loadNative(): Native {
  if (native) return native
  const koffi = require('koffi') as Koffi
  const kernel32 = koffi.load('kernel32.dll')

  koffi.struct('SIZEOUT', { value: 'size_t' })
  koffi.struct('DWORDSIZE', { value: 'uint32' })
  const MODULEINFO = koffi.struct('MODULEINFO', {
    lpBaseOfDll: 'uintptr',
    SizeOfImage: 'uint32',
    EntryPoint: 'uintptr'
  })

  // Win32 BOOL is a 32-bit int, not a byte — declaring `bool` would read only the
  // low byte of the return register.
  native = {
    koffi,
    OpenProcess: kernel32.func(
      'void* __stdcall OpenProcess(uint32 dwDesiredAccess, int32 bInheritHandle, uint32 dwProcessId)'
    ),
    CloseHandle: kernel32.func('int32 __stdcall CloseHandle(void *hObject)'),
    ReadProcessMemory: kernel32.func(
      'int32 __stdcall ReadProcessMemory(void *hProcess, uintptr lpBaseAddress, _Out_ uint8_t *lpBuffer, size_t nSize, _Out_ SIZEOUT *lpNumberOfBytesRead)'
    ),
    // The K32-prefixed exports live in kernel32 on Win7+, avoiding psapi.dll versioning.
    EnumProcessModulesEx: kernel32.func(
      'int32 __stdcall K32EnumProcessModulesEx(void *hProcess, _Out_ uintptr *lphModule, uint32 cb, _Out_ DWORDSIZE *lpcbNeeded, uint32 dwFilterFlag)'
    ),
    // lpFilename takes a raw output Buffer; an out-string would only reserve room
    // for the value passed in and truncate every path to one character.
    GetModuleFileNameExW: kernel32.func(
      'uint32 __stdcall K32GetModuleFileNameExW(void *hProcess, uintptr hModule, _Out_ uint8_t *lpFilename, uint32 nSize)'
    ),
    GetModuleInformation: kernel32.func(
      'int32 __stdcall K32GetModuleInformation(void *hProcess, uintptr hModule, _Out_ MODULEINFO *lpmodinfo, uint32 cb)'
    ),
    IsWow64Process: kernel32.func('int32 __stdcall IsWow64Process(void *hProcess, _Out_ DWORDSIZE *Wow64Process)'),
    moduleInfoSize: koffi.sizeof(MODULEINFO) as number
  }
  return native
}

const MAX_PATH_CHARS = 260

/**
 * A handle to another process plus the reads it permits.
 * Always `close()` when finished — the handle is a real OS resource.
 */
export class ProcessMemory implements MemoryReader {
  private handle: unknown
  private readonly api: Native

  private constructor(api: Native, handle: unknown) {
    this.api = api
    this.handle = handle
  }

  /** Opens `pid` for reading, or returns null when access is denied or the pid is gone. */
  static open(pid: number): ProcessMemory | null {
    if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return null
    try {
      const api = loadNative()
      const handle = api.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid)
      if (!handle) return null
      return new ProcessMemory(api, handle)
    } catch {
      return null
    }
  }

  /**
   * True when the target runs under WOW64 (32-bit on 64-bit Windows). The Mono
   * traversal assumes 8-byte pointers, so a 32-bit target must not be walked.
   */
  isWow64(): boolean {
    if (!this.handle) return false
    try {
      const wow64 = { value: 0 }
      if (!this.api.IsWow64Process(this.handle, wow64)) return false
      return wow64.value !== 0
    } catch {
      return false
    }
  }

  read(address: bigint, length: number): Buffer | null {
    if (!this.handle || length <= 0 || length > MAX_READ) return null
    if (address <= 0n) return null
    const buffer = Buffer.alloc(length)
    const read = { value: 0 }
    try {
      const ok = this.api.ReadProcessMemory(this.handle, address, buffer, length, read)
      // A partial read means the range crosses out of mapped memory; treat it as a miss
      // rather than handing back a half-filled buffer.
      if (!ok || read.value !== length) return null
      return buffer
    } catch {
      return null
    }
  }

  /** Lists loaded modules; used to locate the Mono runtime DLL. */
  modules(): ProcessModule[] {
    if (!this.handle) return []
    try {
      const capacity = 1024
      const handles = new Array<bigint>(capacity).fill(0n)
      const needed = { value: 0 }
      const ok = this.api.EnumProcessModulesEx(
        this.handle,
        handles,
        capacity * 8,
        needed,
        LIST_MODULES_ALL
      )
      if (!ok) return []
      const count = Math.min(capacity, Math.floor(needed.value / 8))
      const out: ProcessModule[] = []
      const nameBuf = Buffer.alloc(MAX_PATH_CHARS * 2)
      for (let i = 0; i < count; i++) {
        const module = handles[i]
        if (!module) continue
        nameBuf.fill(0)
        // Returns the character count written, excluding the terminator.
        const written = this.api.GetModuleFileNameExW(this.handle, module, nameBuf, MAX_PATH_CHARS)
        if (!written || written > MAX_PATH_CHARS) continue
        const path = nameBuf.toString('utf16le', 0, written * 2)
        if (!path) continue
        const info = { lpBaseOfDll: 0n, SizeOfImage: 0, EntryPoint: 0n }
        if (!this.api.GetModuleInformation(this.handle, module, info, this.api.moduleInfoSize)) continue
        out.push({
          base: BigInt(info.lpBaseOfDll),
          size: info.SizeOfImage,
          path,
          name: path.split(/[\\/]/).pop() ?? path
        })
      }
      return out
    } catch {
      return []
    }
  }

  close(): void {
    if (!this.handle) return
    try {
      this.api.CloseHandle(this.handle)
    } catch {
      /* handle already invalid */
    }
    this.handle = null
  }
}

/** Picks the loaded module most likely to be the Mono runtime. */
export function findMonoModule(modules: ProcessModule[]): ProcessModule | null {
  const monoish = modules.filter((m) => /mono/i.test(m.name))
  if (monoish.length === 0) return null
  // Current Hearthstone ships mono-2.0-bdwgc.dll; prefer it, then any mono DLL.
  return (
    monoish.find((m) => /^mono-2\.0/i.test(m.name)) ??
    monoish.find((m) => /bdwgc/i.test(m.name)) ??
    monoish[0]
  )
}

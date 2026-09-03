/**
 * Typed reads over an arbitrary process address space.
 *
 * The reader is injectable so every consumer (PE parsing, Mono traversal) stays
 * pure and unit-testable against a synthetic memory image — no live game needed.
 */

export interface MemoryReader {
  /** Returns exactly `length` bytes at `address`, or null if the range is unreadable. */
  read(address: bigint, length: number): Buffer | null
}

export const NULL_PTR = 0n

/** User-mode pointers on Win64 live below the 128 TiB canonical split. */
const MAX_USER_ADDRESS = 0x7fff_ffff_ffffn

export function isPlausiblePointer(value: bigint): boolean {
  return value > 0x10000n && value < MAX_USER_ADDRESS
}

export function readU8(reader: MemoryReader, address: bigint): number | null {
  const buf = reader.read(address, 1)
  return buf ? buf.readUInt8(0) : null
}

export function readU16(reader: MemoryReader, address: bigint): number | null {
  const buf = reader.read(address, 2)
  return buf ? buf.readUInt16LE(0) : null
}

export function readU32(reader: MemoryReader, address: bigint): number | null {
  const buf = reader.read(address, 4)
  return buf ? buf.readUInt32LE(0) : null
}

export function readI32(reader: MemoryReader, address: bigint): number | null {
  const buf = reader.read(address, 4)
  return buf ? buf.readInt32LE(0) : null
}

export function readU64(reader: MemoryReader, address: bigint): bigint | null {
  const buf = reader.read(address, 8)
  return buf ? buf.readBigUInt64LE(0) : null
}

/** Reads a pointer-sized value (64-bit only; Hearthstone has been x64 for years). */
export function readPtr(reader: MemoryReader, address: bigint): bigint | null {
  return readU64(reader, address)
}

/**
 * Reads up to `max` bytes, returning the longest readable prefix.
 *
 * A fixed-size read fails outright when the tail crosses into an unmapped page,
 * which is common near page boundaries. Walking forward in chunks keeps whatever
 * is actually mapped instead of discarding the entire range.
 */
export function readAtMost(reader: MemoryReader, address: bigint, max: number): Buffer | null {
  const direct = reader.read(address, max)
  if (direct) return direct

  const chunk = 16
  const parts: Buffer[] = []
  let offset = 0
  while (offset < max) {
    const want = Math.min(chunk, max - offset)
    const buf = reader.read(address + BigInt(offset), want)
    if (buf) {
      parts.push(buf)
      offset += want
      continue
    }
    // This chunk straddles the end of the mapping — salvage the readable bytes.
    for (let i = 0; i < want; i++) {
      const one = reader.read(address + BigInt(offset + i), 1)
      if (!one) break
      parts.push(one)
    }
    break
  }
  return parts.length > 0 ? Buffer.concat(parts) : null
}

/**
 * Reads a NUL-terminated ASCII/UTF-8 string. Returns null when the range is
 * unreadable, when no terminator appears within `max`, or when the bytes are not
 * printable — a non-string hit is how we detect a mis-calibrated struct offset.
 */
export function readCString(reader: MemoryReader, address: bigint, max = 256): string | null {
  if (!isPlausiblePointer(address)) return null
  const buf = readAtMost(reader, address, max)
  if (!buf) return null
  const end = buf.indexOf(0)
  if (end < 0) return null
  if (end === 0) return ''
  const slice = buf.subarray(0, end)
  for (const byte of slice) {
    if (byte < 0x20 || byte > 0x7e) return null
  }
  return slice.toString('latin1')
}

/** Follows a pointer field and reads the C string it points at. */
export function readCStringAt(reader: MemoryReader, address: bigint, max = 256): string | null {
  const ptr = readPtr(reader, address)
  if (ptr == null) return null
  return readCString(reader, ptr, max)
}

/** Caches reads so repeated struct probing during offset calibration stays cheap. */
export function cachedReader(inner: MemoryReader, pageSize = 0x1000): MemoryReader {
  const pages = new Map<bigint, Buffer | null>()
  const pageSizeBig = BigInt(pageSize)

  const page = (index: bigint): Buffer | null => {
    if (pages.has(index)) return pages.get(index) ?? null
    const buf = inner.read(index * pageSizeBig, pageSize)
    pages.set(index, buf)
    return buf
  }

  return {
    read(address: bigint, length: number): Buffer | null {
      if (length <= 0) return Buffer.alloc(0)
      const first = address / pageSizeBig
      const last = (address + BigInt(length - 1)) / pageSizeBig
      const out = Buffer.alloc(length)
      let written = 0
      for (let index = first; index <= last; index++) {
        const buf = page(index)
        if (!buf) return null
        const pageStart = index * pageSizeBig
        const from = address > pageStart ? Number(address - pageStart) : 0
        const to = Math.min(pageSize, from + (length - written))
        buf.copy(out, written, from, to)
        written += to - from
      }
      return written === length ? out : null
    }
  }
}

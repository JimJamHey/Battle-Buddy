/**
 * Mono class metadata and managed object reads, layered on the runtime traversal
 * in `mono.ts`.
 *
 * The offsets below are the 64-bit layout used by the Mono builds Unity ships with
 * Hearthstone. They are not guessed: the four offsets `mono.ts` calibrates at
 * runtime (`domain_assemblies` 0xa0, `aname.name` 0x10, `image` 0x60) were
 * confirmed against a live client and match this same table, which is what gives
 * confidence in the rest of it.
 *
 * Every lookup here is still validated by reading back a name, so a layout change
 * surfaces as "class not found" rather than as a plausible-looking wrong number.
 */

import {
  isPlausiblePointer,
  readCString,
  readI32,
  readPtr,
  readU32,
  type MemoryReader
} from './processMemory'

/** MonoImage → MonoInternalHashTable holding every class in the image. */
const IMAGE_CLASS_CACHE = 0x4d0n
const HASH_TABLE_SIZE = 0x18n
const HASH_TABLE_TABLE = 0x20n

const CLASS_NAME = 0x48n
const CLASS_NAME_SPACE = 0x50n
const CLASS_VTABLE_SIZE = 0x5cn
const CLASS_FIELDS = 0x98n
const CLASS_RUNTIME_INFO = 0xd0n
const CLASS_FIELD_COUNT = 0x100n
const CLASS_NEXT_CLASS_CACHE = 0x108n

const FIELD_SIZE = 0x20n
const FIELD_NAME = 0x08n
const FIELD_OFFSET = 0x18n

const RUNTIME_INFO_DOMAIN_VTABLES = 0x08n
/** Static field storage sits after MonoVTable's trailing variable-length vtable array. */
const VTABLE_ARRAY_START = 0x48n

/** Managed object header: [0] vtable pointer; MonoVTable[0] is the MonoClass. */
const OBJECT_VTABLE = 0n

/** MonoString: int32 length then UTF-16 payload. */
const STRING_LENGTH = 0x10n
const STRING_CHARS = 0x14n

/** MonoArray: int32 count then inline elements. */
const ARRAY_COUNT = 0x18n
const ARRAY_ELEMENTS = 0x20n

/** Bounds that keep a bad pointer from turning into an unbounded walk. */
const MAX_BUCKET_CHAIN = 4096
const MAX_FIELDS = 512
const MAX_ARRAY = 8192
const MAX_STRING = 512

export interface MonoField {
  name: string
  offset: number
}

export interface MonoClassInfo {
  address: bigint
  name: string
  namespace: string
}

/**
 * Enumerates every class in an image by walking the class-cache hash buckets.
 *
 * The cache is keyed by type token, not by name, so there is no direct lookup —
 * finding a class by name means iterating. `onClass` returning true stops early.
 */
export function forEachClass(
  reader: MemoryReader,
  image: bigint,
  onClass: (info: MonoClassInfo) => boolean | void
): boolean {
  if (!isPlausiblePointer(image)) return false
  const cache = image + IMAGE_CLASS_CACHE
  const size = readU32(reader, cache + HASH_TABLE_SIZE)
  const table = readPtr(reader, cache + HASH_TABLE_TABLE)
  if (size == null || table == null) return false
  if (size === 0 || size > 1 << 20 || !isPlausiblePointer(table)) return false

  for (let bucket = 0; bucket < size; bucket++) {
    let node = readPtr(reader, table + BigInt(bucket * 8))
    let hops = 0
    while (node != null && isPlausiblePointer(node) && hops++ < MAX_BUCKET_CHAIN) {
      const name = readCString(reader, readPtr(reader, node + CLASS_NAME) ?? 0n, 256)
      if (name) {
        const namespace = readCString(reader, readPtr(reader, node + CLASS_NAME_SPACE) ?? 0n, 256) ?? ''
        if (onClass({ address: node, name, namespace })) return true
      }
      const next = readPtr(reader, node + CLASS_NEXT_CLASS_CACHE)
      if (next == null || next === 0n) break
      node = next
    }
  }
  return false
}

/** Finds a class by name, optionally qualified by namespace. */
export function findClass(
  reader: MemoryReader,
  image: bigint,
  name: string,
  namespace?: string
): bigint | null {
  let found: bigint | null = null
  forEachClass(reader, image, (info) => {
    if (info.name !== name) return
    if (namespace != null && info.namespace !== namespace) return
    found = info.address
    return true
  })
  return found
}

/** Reads a class's field table. Field offsets are relative to the object base. */
export function readFields(reader: MemoryReader, monoClass: bigint): MonoField[] {
  if (!isPlausiblePointer(monoClass)) return []
  const count = readI32(reader, monoClass + CLASS_FIELD_COUNT)
  const fields = readPtr(reader, monoClass + CLASS_FIELDS)
  if (count == null || fields == null) return []
  if (count <= 0 || count > MAX_FIELDS || !isPlausiblePointer(fields)) return []

  const out: MonoField[] = []
  for (let i = 0; i < count; i++) {
    const base = fields + BigInt(i) * FIELD_SIZE
    const name = readCString(reader, readPtr(reader, base + FIELD_NAME) ?? 0n, 256)
    const offset = readI32(reader, base + FIELD_OFFSET)
    if (name && offset != null && offset >= 0) out.push({ name, offset })
  }
  return out
}

/** Looks up one field's offset within an object of `monoClass`. */
export function fieldOffset(reader: MemoryReader, monoClass: bigint, name: string): number | null {
  return readFields(reader, monoClass).find((f) => f.name === name)?.offset ?? null
}

/**
 * Address of a class's static field storage.
 *
 * Returns null when the class has no runtime info yet — that means the game has
 * not touched the type, which is a "try again later" state rather than an error.
 */
export function staticFieldBase(reader: MemoryReader, monoClass: bigint): bigint | null {
  if (!isPlausiblePointer(monoClass)) return null
  const runtimeInfo = readPtr(reader, monoClass + CLASS_RUNTIME_INFO)
  if (runtimeInfo == null || !isPlausiblePointer(runtimeInfo)) return null
  const vtable = readPtr(reader, runtimeInfo + RUNTIME_INFO_DOMAIN_VTABLES)
  if (vtable == null || !isPlausiblePointer(vtable)) return null
  const vtableSize = readI32(reader, monoClass + CLASS_VTABLE_SIZE)
  if (vtableSize == null || vtableSize < 0 || vtableSize > 1 << 16) return null
  const staticData = readPtr(reader, vtable + VTABLE_ARRAY_START + BigInt(vtableSize) * 8n)
  if (staticData == null || !isPlausiblePointer(staticData)) return null
  return staticData
}

/** Reads a static reference field by name. */
export function readStaticObject(
  reader: MemoryReader,
  monoClass: bigint,
  fieldName: string
): bigint | null {
  const base = staticFieldBase(reader, monoClass)
  if (base == null) return null
  const offset = fieldOffset(reader, monoClass, fieldName)
  if (offset == null) return null
  const value = readPtr(reader, base + BigInt(offset))
  return value != null && isPlausiblePointer(value) ? value : null
}

/** The runtime class of a managed object, read through its vtable. */
export function objectClass(reader: MemoryReader, object: bigint): bigint | null {
  if (!isPlausiblePointer(object)) return null
  const vtable = readPtr(reader, object + OBJECT_VTABLE)
  if (vtable == null || !isPlausiblePointer(vtable)) return null
  const monoClass = readPtr(reader, vtable)
  return monoClass != null && isPlausiblePointer(monoClass) ? monoClass : null
}

/** The runtime class name of a managed object. */
export function objectClassName(reader: MemoryReader, object: bigint): string | null {
  const monoClass = objectClass(reader, object)
  if (monoClass == null) return null
  return readCString(reader, readPtr(reader, monoClass + CLASS_NAME) ?? 0n, 256)
}

/** Reads a reference field from an instance, resolving the offset by name. */
export function readObjectField(
  reader: MemoryReader,
  object: bigint,
  fieldName: string
): bigint | null {
  const monoClass = objectClass(reader, object)
  if (monoClass == null) return null
  const offset = fieldOffset(reader, monoClass, fieldName)
  if (offset == null) return null
  const value = readPtr(reader, object + BigInt(offset))
  return value != null && isPlausiblePointer(value) ? value : null
}

/** Reads an int32 field from an instance, resolving the offset by name. */
export function readObjectInt(
  reader: MemoryReader,
  object: bigint,
  fieldName: string
): number | null {
  const monoClass = objectClass(reader, object)
  if (monoClass == null) return null
  const offset = fieldOffset(reader, monoClass, fieldName)
  if (offset == null) return null
  return readI32(reader, object + BigInt(offset))
}

/** Reads a managed `System.String`. */
export function readManagedString(reader: MemoryReader, address: bigint): string | null {
  if (!isPlausiblePointer(address)) return null
  const length = readI32(reader, address + STRING_LENGTH)
  if (length == null || length < 0 || length > MAX_STRING) return null
  if (length === 0) return ''
  const buf = reader.read(address + STRING_CHARS, length * 2)
  return buf ? buf.toString('utf16le') : null
}

/** Reads the element pointers of a managed reference array. */
export function readObjectArray(reader: MemoryReader, array: bigint): bigint[] {
  if (!isPlausiblePointer(array)) return []
  const count = readI32(reader, array + ARRAY_COUNT)
  if (count == null || count <= 0 || count > MAX_ARRAY) return []
  const out: bigint[] = []
  for (let i = 0; i < count; i++) {
    const value = readPtr(reader, array + ARRAY_ELEMENTS + BigInt(i) * 8n)
    out.push(value ?? 0n)
  }
  return out
}

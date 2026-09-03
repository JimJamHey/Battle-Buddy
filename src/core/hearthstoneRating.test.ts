import { describe, expect, it } from 'vitest'
import { readBattlegroundsRating } from './hearthstoneRating'
import { findClass, objectClassName, readManagedString, readObjectArray } from './monoClasses'
import type { MemoryReader } from './processMemory'

/**
 * Builds a synthetic Mono heap matching the 64-bit layout the readers assume, so
 * the whole traversal can be exercised without a running Hearthstone. Offsets here
 * are deliberately the real ones — if a constant in monoClasses.ts drifts, this
 * fails.
 */
class Heap implements MemoryReader {
  private readonly bytes = new Map<bigint, number>()
  private readonly pages = new Set<bigint>()
  private cursor = 0x1_0000_0000n
  private static readonly PAGE = 0x1000n

  private map(address: bigint, length: number): void {
    const first = address / Heap.PAGE
    const last = (address + BigInt(Math.max(0, length - 1))) / Heap.PAGE
    for (let p = first; p <= last; p++) this.pages.add(p)
  }

  alloc(size = 0x200): bigint {
    const at = this.cursor
    this.cursor += BigInt(Math.max(size, 0x200))
    this.map(at, size)
    return at
  }

  write(address: bigint, buf: Buffer): void {
    this.map(address, buf.length)
    for (let i = 0; i < buf.length; i++) this.bytes.set(address + BigInt(i), buf[i])
  }

  i32(address: bigint, value: number): void {
    const b = Buffer.alloc(4)
    b.writeInt32LE(value)
    this.write(address, b)
  }

  ptr(address: bigint, value: bigint): void {
    const b = Buffer.alloc(8)
    b.writeBigUInt64LE(value)
    this.write(address, b)
  }

  cstr(value: string): bigint {
    const at = this.alloc(value.length + 1)
    this.write(at, Buffer.concat([Buffer.from(value, 'latin1'), Buffer.from([0])]))
    return at
  }

  /** Managed System.String: int32 length at +0x10, UTF-16 payload at +0x14. */
  managedString(value: string): bigint {
    const at = this.alloc(0x20 + value.length * 2)
    this.i32(at + 0x10n, value.length)
    this.write(at + 0x14n, Buffer.from(value, 'utf16le'))
    return at
  }

  /**
   * Reference array: int32 count at +0x18, elements from +0x20. Real arrays carry
   * a vtable whose class records element_size, which is how the reader tells a
   * pointer array from one holding inline structs.
   */
  array(values: bigint[]): bigint {
    const cls = this.arrayClass(8)
    const at = this.instance(cls, 0x20 + values.length * 8 + 0x10)
    this.i32(at + 0x18n, values.length)
    values.forEach((v, i) => this.ptr(at + 0x20n + BigInt(i) * 8n, v))
    return at
  }

  /**
   * Array of value-type entries, as a BCL Dictionary uses. Each entry is
   * `{ int hashCode; int next; ptr key; ptr value; }` — 24 bytes.
   */
  structEntryArray(pairs: Array<{ key: bigint; value: bigint }>): bigint {
    const stride = 24
    const cls = this.arrayClass(stride)
    const at = this.instance(cls, 0x20 + pairs.length * stride + 0x10)
    this.i32(at + 0x18n, pairs.length)
    pairs.forEach((pair, i) => {
      const base = at + 0x20n + BigInt(i * stride)
      this.i32(base, 0)
      this.i32(base + 4n, -1)
      this.ptr(base + 8n, pair.key)
      this.ptr(base + 16n, pair.value)
    })
    return at
  }

  private arrayClass(elementSize: number): bigint {
    const cls = this.monoClass(`Array_${elementSize}`, 'System', [])
    this.i32(cls + 0x90n, elementSize)
    return cls
  }

  /** MonoClass with a field table; returns its address. */
  monoClass(name: string, namespace: string, fields: Array<[string, number]>): bigint {
    const cls = this.alloc(0x140)
    this.ptr(cls + 0x48n, this.cstr(name))
    this.ptr(cls + 0x50n, this.cstr(namespace))
    const table = this.alloc(Math.max(1, fields.length) * 0x20)
    fields.forEach(([fname, offset], i) => {
      const base = table + BigInt(i) * 0x20n
      this.ptr(base + 0x08n, this.cstr(fname))
      this.i32(base + 0x18n, offset)
    })
    this.i32(cls + 0x100n, fields.length)
    this.ptr(cls + 0x98n, table)
    return cls
  }

  /**
   * Generic instance class, as `List<T>` or `Dictionary<K,V>` produce. The field
   * table is populated on the inflated class, but the count only exists on the
   * generic definition it was inflated from — offset 0x100 here is unrelated data.
   */
  genericClass(name: string, fields: Array<[string, number]>): bigint {
    const definition = this.monoClass(`${name}$definition`, '', fields)
    const cls = this.monoClass(name, '', fields)
    this.i32(cls + 0x100n, 0x5eed) // junk where field_count would be on a plain class
    const generic = this.alloc(0x40)
    this.ptr(generic, definition)
    this.ptr(cls + 0xf0n, generic)
    return cls
  }

  /** Managed instance of `cls`: header word 0 points at a vtable whose [0] is the class. */
  instance(cls: bigint, size = 0x80): bigint {
    const vtable = this.alloc(0x80)
    this.ptr(vtable, cls)
    const obj = this.alloc(size)
    this.ptr(obj, vtable)
    return obj
  }

  /** Attaches static storage to a class and returns the storage base. */
  statics(cls: bigint, vtableSize = 4): bigint {
    const storage = this.alloc(0x100)
    const vtable = this.alloc(0x48 + vtableSize * 8 + 0x10)
    this.ptr(vtable + 0x48n + BigInt(vtableSize) * 8n, storage)
    const runtimeInfo = this.alloc(0x40)
    this.ptr(runtimeInfo + 0x08n, vtable)
    this.ptr(cls + 0xd0n, runtimeInfo)
    this.i32(cls + 0x5cn, vtableSize)
    return storage
  }

  /** Registers classes into an image's class-cache hash table. */
  image(classes: bigint[]): bigint {
    const img = this.alloc(0x600)
    const buckets = 8
    const table = this.alloc(buckets * 8)
    // Chain every class into bucket 0 via next_class_cache.
    classes.forEach((cls, i) => {
      const next = classes[i + 1] ?? 0n
      this.ptr(cls + 0x108n, next)
    })
    this.ptr(table, classes[0] ?? 0n)
    for (let b = 1; b < buckets; b++) this.ptr(table + BigInt(b * 8), 0n)
    this.i32(img + 0x4d0n + 0x18n, buckets)
    this.ptr(img + 0x4d0n + 0x20n, table)
    return img
  }

  read(address: bigint, length: number): Buffer | null {
    const out = Buffer.alloc(length)
    for (let i = 0; i < length; i++) {
      const at = address + BigInt(i)
      if (!this.pages.has(at / Heap.PAGE)) return null
      out[i] = this.bytes.get(at) ?? 0
    }
    return out
  }
}

interface Built {
  heap: Heap
  image: bigint
  ratingObject: bigint
}

function buildHearthstone(
  opts: { solo?: number; duos?: number; serviceName?: string; structEntries?: boolean } = {}
): Built {
  const h = new Heap()

  const ratingClass = h.monoClass('NetCacheBaconRatingInfo', '', [
    ['<Rating>k__BackingField', 0x10],
    ['<DuosRating>k__BackingField', 0x14]
  ])
  const otherCacheClass = h.monoClass('NetCacheGoldBalance', '', [['<Balance>k__BackingField', 0x10]])
  // Containers on the real path are generic instances, which is what previously
  // stopped the walk dead: their field count is not where a plain class keeps it.
  const mapClass = h.genericClass('Map`2', [['valueSlots', 0x10]])
  const netCacheClass = h.monoClass('NetCache', '', [['m_netCache', 0x10]])
  const entryClass = h.monoClass('ServiceEntry', '', [
    ['<ServiceTypeName>k__BackingField', 0x10],
    ['<Service>k__BackingField', 0x18]
  ])
  const servicesClass = h.genericClass('Dictionary`2', [['_entries', 0x10]])
  const locatorClass = h.monoClass('ServiceLocator', '', [['m_services', 0x10]])
  const jobClass = h.monoClass('JobDependency', '', [['m_serviceLocator', 0x10]])
  const listClass = h.genericClass('List`1', [['_items', 0x10]])
  const jobsClass = h.monoClass('HearthstoneJobs', 'Hearthstone', [['s_dependencyBuilder', 0x00]])

  const image = h.image([
    ratingClass,
    otherCacheClass,
    mapClass,
    netCacheClass,
    entryClass,
    servicesClass,
    locatorClass,
    jobClass,
    listClass,
    jobsClass
  ])

  const ratingObject = h.instance(ratingClass)
  h.i32(ratingObject + 0x10n, opts.solo ?? 8547)
  h.i32(ratingObject + 0x14n, opts.duos ?? 6120)

  const otherObject = h.instance(otherCacheClass)
  h.i32(otherObject + 0x10n, 1695)

  const map = h.instance(mapClass)
  h.ptr(map + 0x10n, h.array([otherObject, ratingObject]))

  const netCache = h.instance(netCacheClass)
  h.ptr(netCache + 0x10n, map)

  const entry = h.instance(entryClass)
  h.ptr(entry + 0x10n, h.managedString(opts.serviceName ?? 'NetCache'))
  h.ptr(entry + 0x18n, netCache)

  const services = h.instance(servicesClass)
  h.ptr(
    services + 0x10n,
    opts.structEntries
      ? h.structEntryArray([{ key: h.managedString('NetCache'), value: entry }])
      : h.array([entry])
  )

  const locator = h.instance(locatorClass)
  h.ptr(locator + 0x10n, services)

  const job = h.instance(jobClass)
  h.ptr(job + 0x10n, locator)

  const list = h.instance(listClass)
  h.ptr(list + 0x10n, h.array([job]))

  const statics = h.statics(jobsClass)
  h.ptr(statics, list)

  return { heap: h, image, ratingObject }
}

describe('mono class metadata', () => {
  it('finds a namespaced class in the image class cache', () => {
    const { heap, image } = buildHearthstone()
    expect(findClass(heap, image, 'HearthstoneJobs', 'Hearthstone')).not.toBeNull()
    expect(findClass(heap, image, 'NetCache')).not.toBeNull()
  })

  it('does not match a class in the wrong namespace', () => {
    const { heap, image } = buildHearthstone()
    expect(findClass(heap, image, 'HearthstoneJobs', 'SomethingElse')).toBeNull()
  })

  it('returns null for a class that is not present', () => {
    const { heap, image } = buildHearthstone()
    expect(findClass(heap, image, 'NoSuchClass')).toBeNull()
  })

  it('identifies an object by its runtime class name', () => {
    const { heap, ratingObject } = buildHearthstone()
    expect(objectClassName(heap, ratingObject)).toBe('NetCacheBaconRatingInfo')
  })

  it('reads managed strings and reference arrays', () => {
    const heap = new Heap()
    expect(readManagedString(heap, heap.managedString('NetCache'))).toBe('NetCache')
    const a = heap.alloc()
    const b = heap.alloc()
    expect(readObjectArray(heap, heap.array([a, b]))).toEqual([a, b])
  })
})

describe('readBattlegroundsRating', () => {
  it('walks the service locator to both queue ratings', () => {
    const { heap, image } = buildHearthstone({ solo: 8547, duos: 6120 })
    const result = readBattlegroundsRating(heap, image)
    expect(result.failure).toBeNull()
    expect(result.rating).toEqual({ solo: 8547, duos: 6120 })
  })

  it('picks the rating entry out of a cache holding other types', () => {
    const { heap, image } = buildHearthstone({ solo: 4200 })
    expect(readBattlegroundsRating(heap, image).rating?.solo).toBe(4200)
  })

  it('still finds the rating when intermediate names change', () => {
    // The search matches on the target's class name, so a renamed service entry
    // in between must not break it — that is the whole point of not pinning the path.
    const { heap, image } = buildHearthstone({ serviceName: 'SomeOtherService', solo: 7010 })
    expect(readBattlegroundsRating(heap, image).rating?.solo).toBe(7010)
  })

  it('traverses a dictionary whose entries are inline structs', () => {
    const { heap, image } = buildHearthstone({ structEntries: true, solo: 5881 })
    const result = readBattlegroundsRating(heap, image)
    expect(result.failure).toBeNull()
    expect(result.rating?.solo).toBe(5881)
  })

  it('reports not-found when the rating object is absent', () => {
    const heap = new Heap()
    const jobsClass = heap.monoClass('HearthstoneJobs', 'Hearthstone', [['s_dependencyBuilder', 0x00]])
    const image = heap.image([jobsClass])
    const statics = heap.statics(jobsClass)
    heap.ptr(statics, heap.instance(heap.monoClass('Unrelated', '', [])))
    const result = readBattlegroundsRating(heap, image)
    expect(result.rating).toBeNull()
    expect(result.failure).toBe('not-found')
  })

  it('rejects an implausible rating rather than reporting it', () => {
    const { heap, image } = buildHearthstone({ solo: 999_999, duos: -5 })
    const result = readBattlegroundsRating(heap, image)
    expect(result.rating).toBeNull()
    expect(result.failure).toBe('implausible-rating')
  })

  it('fails cleanly against an image with no Hearthstone classes', () => {
    const heap = new Heap()
    const empty = heap.image([heap.monoClass('Object', 'System', [])])
    expect(readBattlegroundsRating(heap, empty).failure).toBe('no-jobs-class')
  })
})

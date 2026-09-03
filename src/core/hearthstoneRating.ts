/**
 * Walks Hearthstone's managed objects to the Battlegrounds rating.
 *
 * The rating is not in any log file, so this is the only way to read it directly.
 * The route mirrors what Hearthstone Deck Tracker and Firestone do:
 *
 *   Hearthstone.HearthstoneJobs::s_dependencyBuilder   (static)
 *     ._items[0].m_serviceLocator.m_services._entries[]
 *       entry with <ServiceTypeName>k__BackingField == "NetCache"
 *         .<Service>k__BackingField                    -> NetCache instance
 *           .m_netCache.valueSlots[]                   -> values typed as object
 *             element whose runtime class is NetCacheBaconRatingInfo
 *               <Rating>k__BackingField                -> solo
 *               <DuosRating>k__BackingField            -> duos
 *
 * `NetCache` has no static instance to shortcut to; it is only reachable through
 * the service locator. The map stores values as `object`, so the rating entry is
 * identified by its runtime class name rather than by key. Both queues live on the
 * same object as auto-properties, hence the compiler-decorated backing field names.
 */

import {
  findClass,
  objectClassName,
  readManagedString,
  readObjectArray,
  readObjectField,
  readObjectInt,
  readStaticObject
} from './monoClasses'
import { isPlausiblePointer, type MemoryReader } from './processMemory'

const JOBS_CLASS = 'HearthstoneJobs'
const JOBS_NAMESPACE = 'Hearthstone'
const JOBS_STATIC_FIELD = 's_dependencyBuilder'
const SERVICE_NAME = 'NetCache'
const RATING_CLASS = 'NetCacheBaconRatingInfo'

const SERVICE_TYPE_NAME_FIELD = '<ServiceTypeName>k__BackingField'
const SERVICE_FIELD = '<Service>k__BackingField'
const RATING_FIELD = '<Rating>k__BackingField'
const DUOS_RATING_FIELD = '<DuosRating>k__BackingField'

/** Ratings are bounded in practice; anything outside this is a bad read. */
const MIN_RATING = 0
const MAX_RATING = 30000

export interface BattlegroundsRating {
  solo: number | null
  duos: number | null
}

export type RatingReadFailure =
  | 'no-jobs-class'
  | 'no-dependency-builder'
  | 'no-service-locator'
  | 'no-service-entries'
  | 'no-netcache'
  | 'no-netcache-map'
  | 'no-rating-object'
  | 'implausible-rating'

export interface RatingReadResult {
  rating: BattlegroundsRating | null
  failure: RatingReadFailure | null
  diagnostics: string[]
}

function plausible(value: number | null): number | null {
  if (value == null) return null
  if (!Number.isFinite(value) || value < MIN_RATING || value > MAX_RATING) return null
  return value
}

/** Reads the first element of a `List<T>` backing array, whatever it is named. */
function firstListItem(reader: MemoryReader, list: bigint): bigint | null {
  for (const field of ['_items', 'items', '_array']) {
    const items = readObjectField(reader, list, field)
    if (items == null) continue
    const values = readObjectArray(reader, items)
    const first = values.find((v) => isPlausiblePointer(v))
    if (first != null) return first
  }
  return null
}

/** Reads the entry array of a dictionary-like object under its various field names. */
function entryArray(reader: MemoryReader, map: bigint): bigint[] {
  for (const field of ['_entries', 'entries', 'valueSlots']) {
    const entries = readObjectField(reader, map, field)
    if (entries == null) continue
    const values = readObjectArray(reader, entries).filter((v) => isPlausiblePointer(v))
    if (values.length) return values
  }
  return []
}

/**
 * Reads the Battlegrounds rating out of a live Hearthstone process.
 *
 * `image` is the `Assembly-CSharp` MonoImage resolved by `probeMonoRuntime`.
 * Returns a failure code naming the stage that stopped, so a client patch that
 * moves something produces a diagnosable report instead of a wrong number.
 */
export function readBattlegroundsRating(reader: MemoryReader, image: bigint): RatingReadResult {
  const diagnostics: string[] = []

  const jobs = findClass(reader, image, JOBS_CLASS, JOBS_NAMESPACE)
  if (jobs == null) return { rating: null, failure: 'no-jobs-class', diagnostics }
  diagnostics.push(`${JOBS_NAMESPACE}.${JOBS_CLASS} @ 0x${jobs.toString(16)}`)

  const builder = readStaticObject(reader, jobs, JOBS_STATIC_FIELD)
  if (builder == null) return { rating: null, failure: 'no-dependency-builder', diagnostics }

  const firstJob = firstListItem(reader, builder)
  if (firstJob == null) return { rating: null, failure: 'no-service-locator', diagnostics }

  const locator = readObjectField(reader, firstJob, 'm_serviceLocator')
  const services = locator ? readObjectField(reader, locator, 'm_services') : null
  if (services == null) return { rating: null, failure: 'no-service-locator', diagnostics }

  const entries = entryArray(reader, services)
  if (!entries.length) return { rating: null, failure: 'no-service-entries', diagnostics }
  diagnostics.push(`service locator: ${entries.length} entries`)

  let netCache: bigint | null = null
  for (const entry of entries) {
    const nameRef = readObjectField(reader, entry, SERVICE_TYPE_NAME_FIELD)
    if (nameRef == null) continue
    if (readManagedString(reader, nameRef) !== SERVICE_NAME) continue
    netCache = readObjectField(reader, entry, SERVICE_FIELD)
    break
  }
  if (netCache == null) return { rating: null, failure: 'no-netcache', diagnostics }
  diagnostics.push(`${SERVICE_NAME} @ 0x${netCache.toString(16)}`)

  const map = readObjectField(reader, netCache, 'm_netCache')
  const slots = map ? readObjectField(reader, map, 'valueSlots') : null
  if (slots == null) return { rating: null, failure: 'no-netcache-map', diagnostics }

  const values = readObjectArray(reader, slots).filter((v) => isPlausiblePointer(v))
  const ratingObject = values.find((v) => objectClassName(reader, v) === RATING_CLASS)
  if (ratingObject == null) return { rating: null, failure: 'no-rating-object', diagnostics }
  diagnostics.push(`${RATING_CLASS} @ 0x${ratingObject.toString(16)}`)

  const solo = plausible(readObjectInt(reader, ratingObject, RATING_FIELD))
  const duos = plausible(readObjectInt(reader, ratingObject, DUOS_RATING_FIELD))
  if (solo == null && duos == null) {
    return { rating: null, failure: 'implausible-rating', diagnostics }
  }
  diagnostics.push(`rating solo=${solo ?? '—'} duos=${duos ?? '—'}`)

  return { rating: { solo, duos }, failure: null, diagnostics }
}

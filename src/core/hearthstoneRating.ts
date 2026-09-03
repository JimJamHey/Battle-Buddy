/**
 * Walks Hearthstone's managed objects to the Battlegrounds rating.
 *
 * The rating is not in any log file, so reading the client's own memory is the
 * only direct route. The value lives on a `NetCacheBaconRatingInfo` object, which
 * holds both queues as auto-properties (hence the compiler-decorated backing field
 * names) and is reachable from the static job dependency builder:
 *
 *   Hearthstone.HearthstoneJobs::s_dependencyBuilder
 *     -> job -> service locator -> service map -> NetCache -> its cache map
 *       -> NetCacheBaconRatingInfo { <Rating>, <DuosRating> }
 *
 * Rather than hardcode each intermediate field name, this does a bounded
 * breadth-first search over the object graph from that static root and stops at
 * the first object whose runtime class is `NetCacheBaconRatingInfo`. The exact
 * shapes in between (Blizzard's `Map` vs a BCL `Dictionary`, reference arrays vs
 * inline struct entries) have changed before and are the most likely thing to
 * change again; the class name of the target is far more stable. The search is
 * depth- and visit-bounded so a wrong turn costs time, not a hang.
 */

import {
  arrayElementPointers,
  classNameOf,
  findClass,
  instancePointers,
  readObjectInt,
  readStaticObject
} from './monoClasses'
import { isPlausiblePointer, type MemoryReader } from './processMemory'

const JOBS_CLASS = 'HearthstoneJobs'
const JOBS_NAMESPACE = 'Hearthstone'
const JOBS_STATIC_FIELD = 's_dependencyBuilder'
const RATING_CLASS = 'NetCacheBaconRatingInfo'

const RATING_FIELD = '<Rating>k__BackingField'
const DUOS_RATING_FIELD = '<DuosRating>k__BackingField'

/** Ratings are bounded in practice; anything outside this is a bad read. */
const MIN_RATING = 0
const MAX_RATING = 30000

/** Search bounds. The real target sits ~6 hops from the root. */
const MAX_DEPTH = 12
const MAX_VISITS = 60000

export interface BattlegroundsRating {
  solo: number | null
  duos: number | null
}

export type RatingReadFailure =
  | 'no-jobs-class'
  | 'no-dependency-builder'
  | 'not-found'
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

/** Every managed reference reachable one hop from `object`. */
function neighbours(reader: MemoryReader, object: bigint): bigint[] {
  const fromArray = arrayElementPointers(reader, object)
  if (fromArray.length) return fromArray
  return instancePointers(reader, object)
}

/**
 * Breadth-first search for the rating object, starting from the static root.
 * Returns its address, or null when the search is exhausted or bounded out.
 */
export function findRatingObject(
  reader: MemoryReader,
  root: bigint
): { address: bigint | null; visited: number; depth: number } {
  const seen = new Set<bigint>([root])
  let frontier = [root]
  let visited = 0

  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next: bigint[] = []
    for (const object of frontier) {
      visited++
      if (visited > MAX_VISITS) return { address: null, visited, depth }
      if (classNameOf(reader, object) === RATING_CLASS) {
        return { address: object, visited, depth }
      }
      for (const child of neighbours(reader, object)) {
        if (!isPlausiblePointer(child) || seen.has(child)) continue
        seen.add(child)
        next.push(child)
      }
    }
    frontier = next
  }
  return { address: null, visited, depth: MAX_DEPTH }
}

/**
 * Reads the Battlegrounds rating out of a live Hearthstone process.
 *
 * `image` is the `Assembly-CSharp` MonoImage resolved by `probeMonoRuntime`.
 * `jobsClass` may be supplied to skip the class-cache scan, which is by far the
 * most expensive step and only needs doing once per game process.
 */
export function readBattlegroundsRating(
  reader: MemoryReader,
  image: bigint,
  jobsClass?: bigint | null
): RatingReadResult {
  const diagnostics: string[] = []

  const jobs = jobsClass ?? findClass(reader, image, JOBS_CLASS, JOBS_NAMESPACE)
  if (jobs == null) return { rating: null, failure: 'no-jobs-class', diagnostics }

  const builder = readStaticObject(reader, jobs, JOBS_STATIC_FIELD)
  if (builder == null) {
    // Normal before the game finishes booting: the type has no static data yet.
    return { rating: null, failure: 'no-dependency-builder', diagnostics }
  }

  const found = findRatingObject(reader, builder)
  diagnostics.push(`object search: ${found.visited} objects, depth ${found.depth}`)
  if (found.address == null) return { rating: null, failure: 'not-found', diagnostics }

  const solo = plausible(readObjectInt(reader, found.address, RATING_FIELD))
  const duos = plausible(readObjectInt(reader, found.address, DUOS_RATING_FIELD))
  if (solo == null && duos == null) {
    return { rating: null, failure: 'implausible-rating', diagnostics }
  }
  diagnostics.push(`rating solo=${solo ?? '—'} duos=${duos ?? '—'}`)

  return { rating: { solo, duos }, failure: null, diagnostics }
}

export { JOBS_CLASS, JOBS_NAMESPACE }

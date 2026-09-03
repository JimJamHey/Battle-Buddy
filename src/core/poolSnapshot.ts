import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PoolSnapshot } from './strategy'

/** HSJSON build baked into committed `data/pool-snapshot.json`. Bump when curating a new patch. */
export const COMMITTED_POOL_BUILD = '250339'

const SNAPSHOT_PATH = join(process.cwd(), 'data', 'pool-snapshot.json')

export function poolSnapshotPath(): string {
  return SNAPSHOT_PATH
}

export function loadPoolSnapshot(): PoolSnapshot {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as PoolSnapshot
}

/** Numeric HSJSON build for ordering; null when missing or non-numeric. */
export function poolBuildNumber(snapshot: PoolSnapshot): number | null {
  const raw = snapshot.build?.trim()
  if (!raw || !/^\d+$/.test(raw)) return null
  return Number(raw)
}

/**
 * Fail fast when the committed snapshot is older than the repo expects.
 * After `npm run curate`, update `COMMITTED_POOL_BUILD` to the new build id.
 */
export function assertCommittedPoolBuild(snapshot: PoolSnapshot = loadPoolSnapshot()): void {
  const build = snapshot.build
  if (!build) {
    throw new Error('pool-snapshot.json is missing a build id — run npm run curate')
  }
  const current = poolBuildNumber(snapshot)
  const expected = poolBuildNumber({ ...snapshot, build: COMMITTED_POOL_BUILD })
  if (current == null || expected == null) {
    if (build !== COMMITTED_POOL_BUILD) {
      throw new Error(`pool snapshot build ${build} does not match COMMITTED_POOL_BUILD ${COMMITTED_POOL_BUILD}`)
    }
    return
  }
  if (current < expected) {
    throw new Error(
      `pool snapshot build ${build} is older than COMMITTED_POOL_BUILD ${COMMITTED_POOL_BUILD} — run npm run curate`
    )
  }
}

export function snapshotCardById(snapshot: PoolSnapshot, cardId: string): PoolSnapshot['cards'][0] | undefined {
  return snapshot.cards.find((card) => card.id === cardId)
}

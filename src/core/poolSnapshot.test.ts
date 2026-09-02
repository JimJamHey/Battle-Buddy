import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMBAT_KITS } from './combatKits'
import {
  assertCommittedPoolBuild,
  COMMITTED_POOL_BUILD,
  loadPoolSnapshot,
  poolBuildNumber,
  snapshotCardById
} from './poolSnapshot'

function kitBaseId(cardId: string): string {
  return cardId.replace(/_SKIN_[A-Z0-9]+$/i, '').replace(/_G$/i, '')
}

describe('poolSnapshot', () => {
  it('matches the committed HSJSON build gate', () => {
    const snapshot = loadPoolSnapshot()
    expect(snapshot.build).toBe(COMMITTED_POOL_BUILD)
    expect(() => assertCommittedPoolBuild(snapshot)).not.toThrow()
    expect(poolBuildNumber(snapshot)).toBeGreaterThan(200000)
  })

  it('includes every combat kit card from the current pool', () => {
    const snapshot = loadPoolSnapshot()
    const ids = new Set(snapshot.cards.map((card) => card.id))
    const missing: string[] = []
    for (const cardId of Object.keys(COMBAT_KITS)) {
      const base = kitBaseId(cardId)
      if (!ids.has(cardId) && !ids.has(base)) missing.push(cardId)
    }
    expect(missing, `missing kit ids: ${missing.join(', ')}`).toEqual([])
  })

  it('keeps Diremuck Forager and Deflect-o-Bot on the Season 14 snapshot', () => {
    const snapshot = loadPoolSnapshot()
    expect(snapshotCardById(snapshot, 'BG27_556')?.name).toBe('Diremuck Forager')
    expect(snapshotCardById(snapshot, 'BGS_071')?.name).toBe('Deflect-o-Bot')
  })

  it('documents the snapshot source for season rotation', () => {
    const snapshot = loadPoolSnapshot()
    expect(snapshot.source).toContain('hearthstonejson.com')
    expect(snapshot.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(snapshot.cards.length).toBeGreaterThan(400)
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'data/pool-snapshot.json'), 'utf8')) as {
      cards: unknown[]
    }
    expect(raw.cards.length).toBe(snapshot.cards.length)
  })
})

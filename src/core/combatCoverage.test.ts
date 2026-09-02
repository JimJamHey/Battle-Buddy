import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { combatCoverageForCard, combatCoverageReport } from './combatCoverage'
import { combatParseGaps, parseCardCombat } from './combatEffects'
import { buildSummonPools } from './combatSummonPools'
import { assertCommittedPoolBuild, COMMITTED_POOL_BUILD, loadPoolSnapshot } from './poolSnapshot'

describe('combatCoverage', () => {
  const raw = loadPoolSnapshot()
  const pools = buildSummonPools(raw.cards)

  it('reports combat-relevant cards from the current pool snapshot', () => {
    assertCommittedPoolBuild(raw)
    const report = combatCoverageReport(raw.cards, pools)
    expect(report.total).toBeGreaterThan(100)
    expect(report.combatRelevant).toBeGreaterThan(50)
    expect(report.covered + report.partial).toBe(report.combatRelevant)
    expect(raw.build).toBe(COMMITTED_POOL_BUILD)
  })

  it('tracks partial rate against the committed season pool', () => {
    const report = combatCoverageReport(raw.cards, pools)
    const partialRate = report.partial / report.combatRelevant
    expect(partialRate).toBeGreaterThan(0.3)
    expect(partialRate).toBeLessThan(0.7)
  })

  it('marks Deflect-o-Bot on-summon text as covered', () => {
    const text =
      'Divine Shield Whenever you summon a Mech during combat, gain +2 Attack and Divine Shield.'
    const row = combatCoverageForCard(
      {
        id: 'BGS_071',
        name: 'Deflect-o-Bot',
        text,
        mechanics: ['Divine Shield']
      },
      pools
    )
    expect(row.combatRelevant).toBe(true)
    expect(row.covered).toBe(true)
    expect(parseCardCombat(text).triggers.some((t) => t.when === 'onSummon')).toBe(true)
  })

  it('flags during-combat effects that are not on-summon as partial', () => {
    const text = 'Whenever a friendly minion gains Attack during combat, give it +1 Health permanently.'
    expect(combatParseGaps(text)).toContain('During Combat')
    const row = combatCoverageForCard(
      {
        id: 'TB_BaconShop_HERO_52_Buddy',
        name: 'Sinestra',
        text
      },
      pools
    )
    expect(row.combatRelevant).toBe(true)
    expect(row.covered).toBe(false)
    expect(row.gaps).toContain('During Combat')
  })

  it('parses tribe random summons without a Random summon gap when pools exist', () => {
    const kit = parseCardCombat('Deathrattle: Summon a random Murloc.')
    expect(kit.triggers[0]?.effects[0]?.op).toBe('summonRandom')
    const row = combatCoverageForCard(
      {
        id: 'X',
        name: 'Murloc Spawner',
        text: 'Deathrattle: Summon a random Murloc.'
      },
      pools
    )
    expect(row.gaps).not.toContain('Random summon')
    expect(row.gaps).not.toContain('Summon pool')
  })

  it('flags summonRandom cards when tribe pools are empty', () => {
    const row = combatCoverageForCard(
      {
        id: 'X',
        name: 'Murloc Spawner',
        text: 'Deathrattle: Summon a random Murloc.'
      },
      {}
    )
    expect(row.gaps).toContain('Summon pool')
  })
})

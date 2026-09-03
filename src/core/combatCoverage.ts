import { combatParseGaps } from './combatEffects'
import { cardTextIsCombatRelevant } from './combatMechanics'
import { kitCoversGap, lookupCombatKit } from './combatKits'
import type { SummonPools } from './combatSummonPools'

export type CoverageCard = {
  id: string
  name: string
  text?: string
  mechanics?: string[]
  kind?: string
  techLevel?: number
}

export type CoverageRow = {
  id: string
  name: string
  gaps: string[]
  combatRelevant: boolean
  covered: boolean
}

export type CoverageReport = {
  total: number
  combatRelevant: number
  covered: number
  partial: number
  uncoveredIds: string[]
  rows: CoverageRow[]
}

function summonPoolGaps(kit: ReturnType<typeof lookupCombatKit>, summonPools?: SummonPools): string[] {
  if (!summonPools) return []
  const gaps: string[] = []
  const tier = 6
  for (const row of kit.triggers) {
    for (const fx of row.effects) {
      if (fx.op !== 'summonRandom' || !fx.tribe) continue
      const pool = summonPools[fx.tribe.toLowerCase()]?.filter((body) => body.techLevel <= tier) ?? []
      if (!pool.length) gaps.push('Summon pool')
    }
  }
  return gaps
}

export function combatCoverageForCard(card: CoverageCard, summonPools?: SummonPools): CoverageRow {
  const text = card.text ?? ''
  const mechanics = card.mechanics ?? []
  const combatRelevant = cardTextIsCombatRelevant(text, mechanics)
  const kit = lookupCombatKit(card.id, text, { id: card.id, text })
  const gaps = [
    ...combatParseGaps(text, mechanics).filter((gap) => !kitCoversGap(kit, gap)),
    ...summonPoolGaps(kit, summonPools)
  ]
  const unique = [...new Set(gaps)]
  const covered = !combatRelevant || unique.length === 0
  return { id: card.id, name: card.name, gaps: unique, combatRelevant, covered }
}

export function combatCoverageReport(catalog: CoverageCard[], summonPools?: SummonPools): CoverageReport {
  const rows = catalog.map((card) => combatCoverageForCard(card, summonPools))
  const combatRows = rows.filter((row) => row.combatRelevant)
  const partial = combatRows.filter((row) => !row.covered).length
  return {
    total: catalog.length,
    combatRelevant: combatRows.length,
    covered: combatRows.length - partial,
    partial,
    uncoveredIds: combatRows.filter((row) => !row.covered).map((row) => row.id),
    rows
  }
}

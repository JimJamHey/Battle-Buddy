import type { CombatKit } from './combatEffects'
import { lookupCombatKit } from './combatKits'

export type SummonPoolBody = {
  cardId: string
  name: string
  attack: number
  health: number
  tribes: string[]
  techLevel: number
  kit: CombatKit
}

export type SummonPools = Record<string, SummonPoolBody[]>

type PoolCard = {
  id: string
  name: string
  attack?: number
  health?: number
  tribes?: string[]
  techLevel?: number
  text?: string
  kind?: string
}

function tribeKey(tribe: string): string {
  return tribe.toLowerCase()
}

/** Build tribe-keyed random summon pools from the live minion catalog. */
export function buildSummonPools(catalog: PoolCard[], lobbyTribes?: string[]): SummonPools {
  const allowed = lobbyTribes?.length
    ? new Set(lobbyTribes.map((row) => row.toLowerCase()))
    : null
  const pools: SummonPools = {}
  for (const card of catalog) {
    if (card.kind && card.kind !== 'minion') continue
    const attack = card.attack ?? 0
    const health = card.health ?? 0
    if (attack <= 0 && health <= 0) continue
    for (const tribe of card.tribes ?? []) {
      const key = tribeKey(tribe)
      if (allowed && !allowed.has(key)) continue
      const row: SummonPoolBody = {
        cardId: card.id,
        name: card.name,
        attack: Math.max(1, attack),
        health: Math.max(1, health),
        tribes: card.tribes ?? [tribe],
        techLevel: Math.max(1, card.techLevel ?? 1),
        kit: lookupCombatKit(card.id, card.text ?? '', { id: card.id, text: card.text })
      }
      pools[key] = pools[key] ?? []
      pools[key].push(row)
    }
  }
  return pools
}

export function summonPoolHasTribe(pools: SummonPools, tribe?: string): boolean {
  if (!tribe) return false
  return (pools[tribeKey(tribe)]?.length ?? 0) > 0
}

/** Pick a random body, weighted toward the acting side's tavern tier. */
export function pickRandomSummon(
  pools: SummonPools,
  tribe: string | undefined,
  rng: () => number,
  tavernTier = 6
): SummonPoolBody | null {
  const key = tribe ? tribeKey(tribe) : ''
  const pool = pools[key]
  if (!pool?.length) return null
  const tier = Math.max(1, Math.min(6, tavernTier))
  const eligible = pool.filter((card) => card.techLevel <= tier)
  if (!eligible.length) return null
  const weighted: SummonPoolBody[] = []
  for (const card of eligible) {
    const weight = card.techLevel >= tier ? 3 : card.techLevel >= tier - 1 ? 2 : 1
    for (let i = 0; i < weight; i++) weighted.push(card)
  }
  return weighted[Math.floor(rng() * weighted.length)] ?? null
}

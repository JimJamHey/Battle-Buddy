import { lookupCombatKit } from './combatKits'
import type { CombatInput, CombatMinion, CombatSide } from './combatSim'

type CatalogRow = {
  id: string
  name: string
  attack?: number
  health?: number
  tribes?: string[]
  text?: string
  mechanics?: string[]
}

function nameMatchesOcr(normalized: string, name: string): boolean {
  const key = name.toLowerCase().trim()
  if (key.length < 4) return false
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(` ${normalized} `)
}

function sideSummonsFromHand(side: CombatSide, byId: Map<string, CatalogRow>): boolean {
  const rows = [...side.minions, ...(side.trinkets ?? [])]
  return rows.some((m) => {
    const card = byId.get(m.cardId)
    const kit = m.kit ?? lookupCombatKit(m.cardId, card?.text ?? '', { id: m.cardId, text: card?.text })
    return kit.triggers.some((row) => row.effects.some((fx) => fx.op === 'summonFromHand'))
  })
}

export function combatInputNeedsHandOcr(
  input: CombatInput,
  catalog: CatalogRow[]
): { friendly: boolean; opponent: boolean } {
  const byId = new Map(catalog.map((card) => [card.id, card]))
  return {
    friendly: sideSummonsFromHand(input.friendly, byId) && !(input.friendly.hand?.length),
    opponent: sideSummonsFromHand(input.opponent, byId) && !(input.opponent.hand?.length)
  }
}

export function matchCatalogCardsFromText(text: string, catalog: CatalogRow[]): CombatMinion[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const hits: CombatMinion[] = []
  const seen = new Set<string>()
  const sorted = [...catalog].sort((a, b) => b.name.length - a.name.length)
  for (const card of sorted) {
    if (!nameMatchesOcr(normalized, card.name)) continue
    if (seen.has(card.id)) continue
    seen.add(card.id)
    hits.push({
      cardId: card.id,
      name: card.name,
      attack: card.attack ?? 1,
      health: card.health ?? 1,
      divineShield: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'divine shield'),
      taunt: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'taunt'),
      poisonous: false,
      venomous: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'venomous'),
      reborn: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'reborn'),
      windfury: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'windfury'),
      megaWindfury: false,
      deathrattle: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'deathrattle'),
      tribes: card.tribes
    })
  }
  return hits
}

export function mergeHandOcr(
  input: CombatInput,
  hands: { friendly?: CombatMinion[]; opponent?: CombatMinion[] }
): CombatInput {
  return {
    ...input,
    friendly: hands.friendly?.length ? { ...input.friendly, hand: hands.friendly } : input.friendly,
    opponent: hands.opponent?.length ? { ...input.opponent, hand: hands.opponent } : input.opponent
  }
}

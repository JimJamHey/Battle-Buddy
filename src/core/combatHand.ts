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

export type HandOcrHit = CombatMinion & { statsFromOcr: boolean }

export type HandOcrRead = {
  minions: HandOcrHit[]
  statsUncertain: boolean
}

function nameMatchesOcr(normalized: string, name: string): boolean {
  const key = name.toLowerCase().trim()
  if (key.length < 4) return false
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(` ${normalized} `)
}

/** Pull attack/health printed on a hand card near its name in OCR text. */
export function parseStatsNearCardName(text: string, cardName: string): { attack?: number; health?: number } {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s/]/g, ' ')
  const key = cardName.toLowerCase().trim()
  const padded = ` ${normalized} `
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = padded.match(new RegExp(`\\s${escaped}\\s`))
  if (!match || match.index == null) return {}
  const idx = match.index
  const window = padded.slice(Math.max(0, idx - 28), idx + key.length + 36)
  const slash = window.match(/(\d{1,3})\s*\/\s*(\d{1,3})/)
  if (slash) {
    return { attack: Number(slash[1]), health: Number(slash[2]) }
  }
  const after = window.slice(window.indexOf(key) + key.length).trim()
  const pairAfter = after.match(/^(\d{1,3})\s+(\d{1,3})\b/)
  if (pairAfter) {
    return { attack: Number(pairAfter[1]), health: Number(pairAfter[2]) }
  }
  const before = window.slice(0, window.indexOf(key)).trim()
  const pairBefore = before.match(/(\d{1,3})\s+(\d{1,3})\s*$/)
  if (pairBefore) {
    return { attack: Number(pairBefore[1]), health: Number(pairBefore[2]) }
  }
  return {}
}

function sideSummonsFromHand(side: CombatSide, byId: Map<string, CatalogRow>): boolean {
  const rows = [...side.minions, ...(side.hand ?? []), ...(side.trinkets ?? [])]
  return rows.some((m) => {
    const card = byId.get(m.cardId)
    const kit = m.kit ?? lookupCombatKit(m.cardId, card?.text ?? '', { id: m.cardId, text: card?.text })
    return kit.triggers.some((row) => row.effects.some((fx) => fx.op === 'summonFromHand'))
  })
}

function sideNeedsHandStatOcr(side: CombatSide, byId: Map<string, CatalogRow>): boolean {
  const rows = [...side.minions, ...(side.trinkets ?? [])]
  return rows.some((m) => {
    const card = byId.get(m.cardId)
    const kit = m.kit ?? lookupCombatKit(m.cardId, card?.text ?? '', { id: m.cardId, text: card?.text })
    return kit.triggers.some((row) =>
      row.effects.some((fx) => fx.op === 'summonFromHand' && (fx.select === 'highestAttack' || fx.requiresSpace))
    )
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

export function combatInputNeedsHandStatOcr(
  input: CombatInput,
  catalog: CatalogRow[]
): { friendly: boolean; opponent: boolean } {
  const byId = new Map(catalog.map((card) => [card.id, card]))
  return {
    friendly: sideNeedsHandStatOcr(input.friendly, byId),
    opponent: sideNeedsHandStatOcr(input.opponent, byId)
  }
}

function minionFromCatalog(card: CatalogRow, statsFromOcr: boolean, attack: number, health: number): HandOcrHit {
  return {
    cardId: card.id,
    name: card.name,
    attack,
    health,
    statsFromOcr,
    divineShield: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'divine shield'),
    taunt: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'taunt'),
    poisonous: false,
    venomous: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'venomous'),
    reborn: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'reborn'),
    windfury: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'windfury'),
    megaWindfury: false,
    deathrattle: (card.mechanics ?? []).some((tag) => tag.toLowerCase() === 'deathrattle'),
    tribes: card.tribes
  }
}

export function matchCatalogCardsFromText(text: string, catalog: CatalogRow[]): HandOcrRead {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s/]/g, ' ')
  const hits: HandOcrHit[] = []
  const seen = new Set<string>()
  const sorted = [...catalog].sort((a, b) => b.name.length - a.name.length)
  for (const card of sorted) {
    if (!nameMatchesOcr(normalized, card.name)) continue
    if (seen.has(card.id)) continue
    seen.add(card.id)
    const ocrStats = parseStatsNearCardName(text, card.name)
    const attack = ocrStats.attack ?? card.attack ?? 1
    const health = ocrStats.health ?? card.health ?? 1
    const statsFromOcr = ocrStats.attack != null && ocrStats.health != null
    hits.push(minionFromCatalog(card, statsFromOcr, attack, health))
  }
  return {
    minions: hits,
    statsUncertain: hits.length > 0 && hits.some((row) => !row.statsFromOcr)
  }
}

export function stripHandOcrHits(hits: HandOcrHit[]): CombatMinion[] {
  return hits.map(({ statsFromOcr: _statsFromOcr, ...minion }) => minion)
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

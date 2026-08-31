import { TRIBE_ORDER, canonicalTribe, sortTribes } from './heroes'
import { cardHasMechanic, cardMechanics, MECHANIC_ORDER } from './mechanics'
import type { BgMinion } from './types'

export interface PoolGroup {
  title: string
  cards: BgMinion[]
}

const RELATED_TRIBE_WORDS: Array<[RegExp, string]> = [
  [/\belementals?\b/i, 'Elemental'],
  [/\bmechs?\b|\bmechanical\b/i, 'Mech'],
  [/\bbeasts?\b/i, 'Beast'],
  [/\bdemons?\b/i, 'Demon'],
  [/\bdragons?\b/i, 'Dragon'],
  [/\bmurlocs?\b/i, 'Murloc'],
  [/\bpirates?\b/i, 'Pirate'],
  [/\bnagas?\b/i, 'Naga'],
  [/\bquil+boars?\b/i, 'Quilboar'],
  [/\bundead\b/i, 'Undead'],
  [/\btotems?\b/i, 'Totem']
]

function sortCards(cards: BgMinion[]): BgMinion[] {
  return [...cards].sort((a, b) => {
    if (a.techLevel !== b.techLevel) return a.techLevel - b.techLevel
    return a.name.localeCompare(b.name)
  })
}

function primaryTribe(card: BgMinion, available: string[]): string | null {
  const races = sortTribes(
    card.tribes.map((tribe) => canonicalTribe(tribe) ?? '').filter(Boolean)
  )
  if (!races.length) return null
  if (!available.length) return races[0] ?? null
  const wanted = new Set(available.map((tribe) => canonicalTribe(tribe) ?? tribe))
  return races.find((tribe) => wanted.has(tribe)) ?? null
}

function pushUnique(list: BgMinion[], card: BgMinion, seen: Set<string>): void {
  if (seen.has(card.id)) return
  seen.add(card.id)
  list.push(card)
}

/** Neutrals whose text cares about a tribe (Nomi → Elemental, Kangor → Mech). */
export function relatedTribes(card: BgMinion): string[] {
  if (card.kind === 'spell' || card.kind === 'buddy') return []
  const typed = card.tribes.map((name) => canonicalTribe(name)).filter(Boolean)
  if (typed.length) return []
  const blob = `${card.name} ${card.text}`
  const found = new Set<string>()
  for (const [pattern, tribe] of RELATED_TRIBE_WORDS) {
    if (pattern.test(blob)) found.add(tribe)
  }
  return sortTribes([...found])
}

/** Auto (0) in a match shows shop-legal tiers; out of match, tavernTier 0 keeps the full pool. */
export function minionsForTier(cards: BgMinion[], selectedTier: number, tavernTier: number): BgMinion[] {
  if (selectedTier > 0) return cards.filter((card) => card.techLevel === selectedTier)
  if (!tavernTier) return cards
  const cap = Math.max(1, tavernTier)
  return cards.filter((card) => card.techLevel <= cap)
}

export function groupPoolCards(cards: BgMinion[], availableTribes: string[]): PoolGroup[] {
  const spells: BgMinion[] = []
  const buddies: BgMinion[] = []
  const none: BgMinion[] = []
  const noneSeen = new Set<string>()
  const byTribe = new Map<string, BgMinion[]>()
  const seenByTribe = new Map<string, Set<string>>()
  const wanted = new Set(availableTribes.map((tribe) => canonicalTribe(tribe) ?? tribe))

  const addToTribe = (tribe: string, card: BgMinion) => {
    const seen = seenByTribe.get(tribe) ?? new Set<string>()
    seenByTribe.set(tribe, seen)
    const list = byTribe.get(tribe) ?? []
    pushUnique(list, card, seen)
    byTribe.set(tribe, list)
  }

  for (const card of cards) {
    if (card.kind === 'trinket') continue
    if (card.kind === 'spell') {
      spells.push(card)
      continue
    }
    if (card.kind === 'buddy') {
      buddies.push(card)
      continue
    }
    const races = sortTribes(
      card.tribes.map((tribe) => canonicalTribe(tribe) ?? '').filter(Boolean)
    )
    const tribe = primaryTribe(card, availableTribes) ?? races[0] ?? null
    if (tribe == null) {
      pushUnique(none, card, noneSeen)
    } else {
      addToTribe(tribe, card)
    }
    for (const extra of relatedTribes(card)) {
      if (wanted.size && !wanted.has(extra)) continue
      addToTribe(extra, card)
    }
  }

  const lobbyTitles = availableTribes.filter((title) => byTribe.has(title))
  const extraTitles = TRIBE_ORDER.filter((tribe) => byTribe.has(tribe) && !lobbyTitles.includes(tribe))
  const titles = availableTribes.length ? [...lobbyTitles, ...extraTitles] : extraTitles
  const groups: PoolGroup[] = []
  for (const title of titles) {
    const list = byTribe.get(title)
    if (list?.length) groups.push({ title, cards: sortCards(list) })
  }
  if (none.length) groups.push({ title: 'No Type', cards: sortCards(none) })
  if (spells.length) groups.push({ title: 'Spells', cards: sortCards(spells) })
  if (buddies.length) groups.push({ title: 'Buddy', cards: sortCards(buddies) })
  return groups
}

export function filterPoolGroups(groups: PoolGroup[], tribe: string | null): PoolGroup[] {
  if (!tribe) return groups
  return groups.filter((group) => group.title === tribe)
}

export function splitGroupsByTier(groups: PoolGroup[]): PoolGroup[] {
  const out: PoolGroup[] = []
  for (const group of groups) {
    const byTier = new Map<number, BgMinion[]>()
    for (const card of group.cards) {
      const list = byTier.get(card.techLevel) ?? []
      list.push(card)
      byTier.set(card.techLevel, list)
    }
    for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
      out.push({ title: `Tier ${tier}`, cards: sortCards(byTier.get(tier) ?? []) })
    }
  }
  return out
}

export function filterGroupsByMechanic(groups: PoolGroup[], mechanic: string | null): PoolGroup[] {
  if (!mechanic) return groups
  return groups
    .map((group) => ({
      ...group,
      cards: group.cards.filter((card) => cardHasMechanic(card, mechanic))
    }))
    .filter((group) => group.cards.length > 0)
}

export function mechanicsInGroups(groups: PoolGroup[]): string[] {
  const found = new Set<string>()
  for (const group of groups) {
    for (const card of group.cards) {
      for (const mechanic of cardMechanics(card)) found.add(mechanic)
    }
  }
  return MECHANIC_ORDER.filter((name) => found.has(name))
}

/** Starting shared-pool copies. Live remaining counts come later from shop buys. */
export function poolCopies(card: BgMinion): number {
  const tier = Math.min(7, Math.max(1, card.techLevel || 1))
  if (card.kind === 'buddy') return 1
  if (card.kind === 'spell') return ([0, 5, 7, 9, 11, 9, 7, 5] as const)[tier]
  return ([0, 15, 15, 13, 11, 9, 7, 5] as const)[tier]
}

export function groupLabel(title: string): string {
  if (title === 'No Type') return 'Neutral'
  return title
}

export function isTierGroupTitle(title: string): boolean {
  return /^Tier \d+$/i.test(title)
}

/** Headers already mark tavern tier when grouped by tier or filtered to one tab. */
export function showPoolTierBubbles(groupedByTier: boolean, selectedTier: number): boolean {
  return !groupedByTier && selectedTier <= 0
}

export function tribeAvailableInLobby(
  title: string,
  availableTribes: string[],
  buddyAvailable = false,
  tribesComplete = true
): boolean {
  if (title === 'Buddy') return buddyAvailable || availableTribes.includes('Buddy')
  if (!availableTribes.length || !tribesComplete) return true
  if (title === 'No Type' || title === 'Spells') return true
  const wanted = new Set(availableTribes.map((tribe) => canonicalTribe(tribe) ?? tribe))
  return wanted.has(title)
}

/** True unless this lobby's tribes are known and the card belongs to a missing type. */
export function cardAvailableInLobby(
  card: BgMinion,
  availableTribes: string[],
  buddyAvailable = false,
  tribesComplete = true
): boolean {
  if (card.kind === 'buddy') return buddyAvailable || availableTribes.includes('Buddy')
  if (!availableTribes.length || !tribesComplete) return true
  if (card.kind === 'spell') return true
  const wanted = new Set(availableTribes.map((tribe) => canonicalTribe(tribe) ?? tribe))
  const races = card.tribes.map((tribe) => canonicalTribe(tribe)).filter((tribe): tribe is string => Boolean(tribe))
  if (!races.length) {
    const related = relatedTribes(card)
    if (!related.length) return true
    return related.some((tribe) => wanted.has(tribe))
  }
  return races.some((tribe) => wanted.has(tribe))
}

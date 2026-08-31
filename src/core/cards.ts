import { parseDeathrattleSummon, type DeathrattleSummon } from './combatSim'
import { canonicalTribe, isBgHeroCardId } from './heroes'
import { mechanicsFromCard } from './mechanics'
import type { BgMinion } from './types'

export interface RawCard {
  id?: string
  dbfId?: number
  name?: string
  text?: string
  attack?: number
  health?: number
  type?: string
  set?: string
  race?: string
  races?: string[]
  techLevel?: number
  isBaconPoolMinion?: boolean
  isBattlegroundsPoolMinion?: boolean
  isBattlegroundsDuosExclusive?: boolean
  isBattlegroundsBuddy?: boolean
  isBattlegroundsPoolSpell?: boolean
  isBaconPoolSpell?: boolean
  battlegroundsHero?: boolean
  battlegroundsPremiumDbfId?: number
  battlegroundsNormalDbfId?: number
  cost?: number
  mechanics?: string[]
  battlegrounds?: {
    tier?: number
    hero?: boolean
    companion?: boolean
    quest?: boolean
    reward?: boolean
    spell?: boolean
    duosOnly?: boolean
    solosOnly?: boolean
    upgradeId?: number
    trinket?: boolean
  }
  isBattlegroundsTrinket?: boolean
  isBaconTrinket?: boolean
}

function tribesOf(card: RawCard): string[] {
  const raw = Array.isArray(card.races) && card.races.length ? card.races : card.race ? [card.race] : []
  return [...new Set(raw.map(canonicalTribe).filter((tribe): tribe is string => Boolean(tribe)))]
}

function techLevelOf(card: RawCard): number {
  const fromBg = card.battlegrounds?.tier
  const tech = card.techLevel ?? fromBg ?? 0
  return Number(tech) || 0
}

export function isBattlegroundsBuddy(card: RawCard): boolean {
  if (!card.id || !card.name) return false
  if (card.battlegrounds?.hero || card.battlegroundsHero) return false
  if (card.battlegroundsNormalDbfId) return false
  if (card.battlegrounds?.duosOnly || card.isBattlegroundsDuosExclusive) return false
  if (card.isBattlegroundsBuddy || card.battlegrounds?.companion) return true
  return /_Buddy$/i.test(card.id)
}

export function isBattlegroundsPoolMinion(card: RawCard): boolean {
  if (!card.id || !card.name) return false
  const type = (card.type ?? '').toUpperCase()
  if (type && type !== 'MINION') return false
  if (card.battlegrounds?.hero || card.battlegroundsHero || card.battlegrounds?.companion) return false
  if (card.battlegrounds?.quest || card.battlegrounds?.reward) return false
  if (card.battlegrounds?.duosOnly || card.isBattlegroundsDuosExclusive) return false
  if (card.isBattlegroundsBuddy) return false
  if (card.battlegroundsNormalDbfId && !card.isBattlegroundsPoolMinion && !card.isBaconPoolMinion) return false

  const tech = techLevelOf(card)
  if (tech < 1 || tech > 7) return false

  return card.isBattlegroundsPoolMinion === true || card.isBaconPoolMinion === true
}

export function isBattlegroundsPoolSpell(card: RawCard): boolean {
  if (!card.id || !card.name) return false
  const type = (card.type ?? '').toUpperCase()
  if (type && type !== 'SPELL' && type !== 'BATTLEGROUND_SPELL') return false
  if (card.battlegrounds?.duosOnly || card.isBattlegroundsDuosExclusive) return false
  if (card.battlegroundsNormalDbfId && !card.isBattlegroundsPoolSpell && !card.isBaconPoolSpell) {
    return false
  }
  const tech = techLevelOf(card)
  if (tech < 1 || tech > 7) return false
  return (
    card.isBattlegroundsPoolSpell === true ||
    card.isBaconPoolSpell === true ||
    card.battlegrounds?.spell === true
  )
}

export function goldenCardId(cardId: string, mapped?: string | null): string {
  if (mapped) return mapped
  if (/_G$/i.test(cardId)) return cardId
  return `${cardId}_G`
}

export function isBattlegroundsTrinket(card: RawCard): boolean {
  if (!card.id || !card.name) return false
  if (card.battlegrounds?.duosOnly || card.isBattlegroundsDuosExclusive) return false
  const type = (card.type ?? '').toUpperCase()
  if (type === 'BATTLEGROUND_TRINKET' || type === 'BACON_TRINKET' || type.includes('TRINKET')) return true
  if (card.isBattlegroundsTrinket || card.isBaconTrinket || card.battlegrounds?.trinket) return true
  return /(?:^|_)(?:Trinket|MagicItem)(?:_|$)/i.test(card.id)
}

export function cardSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function toBgMinion(card: RawCard, goldenId?: string | null): BgMinion | null {
  const spell = isBattlegroundsPoolSpell(card)
  const buddy = isBattlegroundsBuddy(card)
  const trinket = isBattlegroundsTrinket(card)
  if (!spell && !buddy && !trinket && !isBattlegroundsPoolMinion(card)) return null
  if (!card.id || !card.name) return null
  const tier = techLevelOf(card)
  return {
    id: card.id,
    dbfId: card.dbfId ?? 0,
    name: card.name,
    text: (card.text ?? '').replace(/<[^>]+>/g, ''),
    attack: card.attack ?? 0,
    health: card.health ?? 0,
    techLevel: tier || (buddy || trinket ? 1 : 0),
    tribes: spell || buddy || trinket ? [] : tribesOf(card),
    tileUrl: cardTileUrls(card.id)[0],
    goldenId: spell || trinket ? null : goldenCardId(card.id, goldenId),
    kind: spell ? 'spell' : buddy ? 'buddy' : trinket ? 'trinket' : 'minion',
    cost: card.cost ?? 0,
    mechanics: mechanicsFromCard(card.mechanics, card.text)
  }
}

export function baseCardId(cardId: string): string {
  return cardId.replace(/_SKIN_[A-Z0-9]+$/i, '')
}

export function poolBaseId(cardId: string): string {
  return baseCardId(cardId).replace(/_G$/i, '')
}

export function isTrinketCardId(cardId: string): boolean {
  return /(?:Trinket|MagicItem)/i.test(cardId)
}

export function heroBuddyCardId(heroCardId: string): string {
  return `${baseCardId(heroCardId)}_Buddy`
}

/** True when this hero has a Buddy card in the catalog (Buddy button exists for them). */
export function heroHasBuddy(
  heroCardId: string | null | undefined,
  cards: Array<{ id: string; kind?: string }>
): boolean {
  if (!heroCardId) return false
  const wanted = heroBuddyCardId(heroCardId).toLowerCase()
  return cards.some((card) => card.kind === 'buddy' && card.id.toLowerCase() === wanted)
}

function artCandidates(cardId: string): string[] {
  const base = baseCardId(cardId)
  return base === cardId ? [cardId] : [cardId, base]
}

/** Transparent Battlegrounds frames. Constructed `/render` PNGs have an opaque grey box. */
function hsjsonBgsCardUrls(cardId: string): string[] {
  return artCandidates(cardId).flatMap((id) => [
    `https://art.hearthstonejson.com/v1/bgs/latest/enUS/512x/${id}.png`,
    `https://art.hearthstonejson.com/v1/bgs/latest/enUS/256x/${id}.png`
  ])
}

function hsjsonConstructedCardUrls(cardId: string): string[] {
  return artCandidates(cardId).flatMap((id) => [
    `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${id}.png`,
    `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${id}.png`
  ])
}

export function cardArtUrls(cardId: string): string[] {
  return artCandidates(cardId).flatMap((id) => [
    `https://art.hearthstonejson.com/v1/256x/${id}.jpg`,
    `https://art.hearthstonejson.com/v1/bgs/latest/enUS/256x/${id}.png`,
    `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${id}.png`
  ])
}

/** Square painting only — used inside the oval warband portraits, never a full card frame. */
export function cardFaceUrls(cardId: string): string[] {
  return artCandidates(cardId).flatMap((id) => [
    `https://art.hearthstonejson.com/v1/512x/${id}.jpg`,
    `https://art.hearthstonejson.com/v1/256x/${id}.jpg`
  ])
}

/**
 * Battlegrounds tavern-style renders (tier stars, gold frame on triples).
 * HSJSON /render of `_G` cards has golden text but a constructed grey frame — do not prefer those.
 */
export function cardTavernRenderUrls(name: string, dbfId?: number, golden = false): string[] {
  const query = golden ? 'golden=true&size=full' : 'size=full'
  const medium = golden ? 'golden=true&size=medium' : 'size=medium'
  const urls: string[] = []
  const slug = cardSlug(name)
  if (slug) {
    urls.push(
      `https://hsbg.cards/api/v1/cards/${encodeURIComponent(slug)}/image?${medium}`,
      `https://hsbg.cards/api/v1/cards/${encodeURIComponent(slug)}/image?${query}`
    )
  }
  if (dbfId) {
    urls.push(`https://hsbg.cards/api/v1/cards/${dbfId}/image?${medium}`)
    urls.push(`https://hsbg.cards/api/v1/cards/${dbfId}/image?${query}`)
  }
  return urls
}

/** Full Battlegrounds card frames — never the square art crop. */
export function boardCardUrls(cardId: string, name?: string, dbfId?: number, golden = false): string[] {
  if (golden) {
    return [...cardTavernRenderUrls(name ?? '', dbfId, true), ...hsjsonBgsCardUrls(cardId)]
  }
  return [
    ...cardTavernRenderUrls(name ?? '', dbfId, false),
    ...hsjsonBgsCardUrls(cardId),
    ...hsjsonConstructedCardUrls(cardId)
  ]
}

/** Full constructed-style renders. Fallback only — missing the Battlegrounds gold frame. */
export function cardRenderUrls(cardId: string, size: 256 | 512 = 512): string[] {
  return artCandidates(cardId).flatMap((id) => {
    if (size === 256) {
      return [
        `https://art.hearthstonejson.com/v1/bgs/latest/enUS/256x/${id}.png`,
        `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${id}.png`
      ]
    }
    return [
      `https://art.hearthstonejson.com/v1/bgs/latest/enUS/512x/${id}.png`,
      `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${id}.png`
    ]
  })
}

export function cardGoldenRenderUrls(goldenId: string, name: string, baseId?: string, dbfId?: number): string[] {
  const ids = [...new Set([goldenId, baseId ? goldenCardId(baseId) : ''].filter(Boolean))]
  return [...ids.flatMap((id) => hsjsonBgsCardUrls(id)), ...cardTavernRenderUrls(name, dbfId, true)]
}

/** HDT-style 256×59 strips for the right-hand pool list. */
export function cardTileUrls(cardId: string): string[] {
  return artCandidates(cardId).flatMap((id) => [
    `https://art.hearthstonejson.com/v1/tiles/${id}.png`
  ]).concat(cardArtUrls(cardId))
}

export function catalogSummonsFromCardsJson(cards: RawCard[]): Record<string, DeathrattleSummon> {
  const out: Record<string, DeathrattleSummon> = {}
  for (const card of cards) {
    if (!card.id) continue
    const summon = parseDeathrattleSummon(card.text ?? '')
    if (summon) out[card.id] = summon
  }
  return out
}

export function catalogHeroesFromCardsJson(cards: RawCard[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const card of cards) {
    if (!card.id || !card.name) continue
    if (card.battlegrounds?.hero || card.battlegroundsHero || isBgHeroCardId(card.id)) {
      out[card.id] = card.name
      const base = baseCardId(card.id)
      if (base !== card.id && !out[base]) out[base] = card.name
    }
  }
  return out
}

export function catalogFromCardsJson(cards: RawCard[]): BgMinion[] {
  const byDbf = new Map<number, string>()
  for (const card of cards) {
    if (card.dbfId && card.id) byDbf.set(card.dbfId, card.id)
  }
  const byNameTier = new Map<string, BgMinion>()
  for (const card of cards) {
    const premium = card.battlegroundsPremiumDbfId ?? card.battlegrounds?.upgradeId
    const goldenId = premium ? byDbf.get(premium) ?? null : null
    const minion = toBgMinion(card, goldenId)
    if (!minion) continue
    const key = `${minion.kind}::${minion.name.toLowerCase()}::${minion.techLevel}`
    const prev = byNameTier.get(key)
    if (!prev || minion.dbfId > prev.dbfId) byNameTier.set(key, minion)
  }
  return [...byNameTier.values()].sort((a, b) => {
    if (a.techLevel !== b.techLevel) return a.techLevel - b.techLevel
    return a.name.localeCompare(b.name)
  })
}

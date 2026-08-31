import type { MatchBuff } from './types'

export type BuffKey = 'gems' | 'elemental' | 'pirate' | 'undead' | 'spells' | 'shop'

export interface BuffKind {
  key: BuffKey
  label: string
  iconCardId: string
}

const SKIP =
  /8P_PlayerE|BaconShop8|Persistent Poet|BaconShopBob|TB_BaconShop_HERO_Kel|Bacon_TagTransfer|ShopBuff_Ench|ShopBuff_Elemental_Ench|ShopBuff_MultiRace_Ench|BG20_GEMe/i

const KINDS: Record<BuffKey, BuffKind> = {
  gems: { key: 'gems', label: 'Blood gems', iconCardId: 'BG20_GEM' },
  elemental: { key: 'elemental', label: 'Elementals', iconCardId: 'BGS_115' },
  pirate: { key: 'pirate', label: 'Pirates', iconCardId: 'BG26_135' },
  undead: { key: 'undead', label: 'Undead', iconCardId: 'BG25_008' },
  spells: { key: 'spells', label: 'Spells', iconCardId: 'BG28_810' },
  shop: { key: 'shop', label: 'Shop', iconCardId: 'BGS_104' }
}

const ORDER: BuffKey[] = ['gems', 'elemental', 'pirate', 'undead', 'spells', 'shop']

const BY_CARD_ID: Record<string, BuffKey> = {
  BG26_159PE: 'gems',
  BG_SHOPBUFF: 'shop',
  BG_SHOPBUFF_ELEMENTAL: 'shop',
  BG_SHOPBUFF_MULTIRACE: 'shop',
  BG35_152PE: 'shop',
  BGS_104E: 'shop',
  BG25_011PE: 'undead'
}

export type PlayerTagKey = 'gems' | 'elemental' | 'pirate' | 'spells'

/** Player-entity GameTags for running +X/+X. Gem tags are extra on top of the base 1/1. */
export const PLAYER_STAT_TAGS: Record<string, { key: PlayerTagKey; stat: 'attack' | 'health' }> = {
  BACON_BLOODGEMBUFFATKVALUE: { key: 'gems', stat: 'attack' },
  BACON_BLOODGEMBUFFHEALTHVALUE: { key: 'gems', stat: 'health' },
  BACON_ELEMENTAL_BUFFATKVALUE: { key: 'elemental', stat: 'attack' },
  BACON_ELEMENTAL_BUFFHEALTHVALUE: { key: 'elemental', stat: 'health' },
  BACON_PIRATE_BUFFATKVALUE: { key: 'pirate', stat: 'attack' },
  BACON_PIRATE_BUFFHEALTHVALUE: { key: 'pirate', stat: 'health' },
  TAVERN_SPELL_ATTACK_INCREASE: { key: 'spells', stat: 'attack' },
  TAVERN_SPELL_HEALTH_INCREASE: { key: 'spells', stat: 'health' }
}

export const PLAYER_TAG_KEYS: PlayerTagKey[] = ['gems', 'elemental', 'pirate', 'spells']

export function emptyTagBuffs(): Record<PlayerTagKey, { attack: number; health: number }> {
  return {
    gems: { attack: 0, health: 0 },
    elemental: { attack: 0, health: 0 },
    pirate: { attack: 0, health: 0 },
    spells: { attack: 0, health: 0 }
  }
}

export function buffKind(key: BuffKey): BuffKind {
  return KINDS[key]
}

export function classifyPlayerBuff(cardId: string, name: string): BuffKind | null {
  const blob = `${cardId} ${name}`
  if (SKIP.test(blob)) return null
  const fromId = BY_CARD_ID[cardId.toUpperCase()]
  if (fromId) return KINDS[fromId]
  const playerWide = /player enchant|shop buff/i.test(name)
  if (playerWide && /blood.?gem/i.test(name)) return KINDS.gems
  if (/nomi|bgs_104e/i.test(blob)) return KINDS.shop
  if (playerWide && /undead/i.test(name)) return KINDS.undead
  if (playerWide && /pirate/i.test(name)) return KINDS.pirate
  if (playerWide && /tavern spell/i.test(name)) return KINDS.spells
  if (playerWide && /shop buff/i.test(name)) return KINDS.shop
  if (playerWide && /elemental/i.test(name)) return KINDS.shop
  return null
}

export function playerTagBuff(
  key: PlayerTagKey,
  attack: number,
  health: number,
  opts?: { quilboarInLobby?: boolean }
): MatchBuff | null {
  const kind = KINDS[key]
  if (key === 'gems') {
    if (attack <= 0 && health <= 0 && !opts?.quilboarInLobby) return null
    return { ...kind, attack: attack + 1, health: health + 1 }
  }
  if (attack <= 0 && health <= 0) return null
  return { ...kind, attack, health }
}

/** Same-key rows are two readings of one buff (enchant + player tag). Last write wins so tags beat enchants when both exist. */
export function mergeBuffs(buffs: MatchBuff[]): MatchBuff[] {
  const byKey = new Map<string, MatchBuff>()
  for (const buff of buffs) {
    if (buff.attack <= 0 && buff.health <= 0) continue
    byKey.set(buff.key, buff)
  }
  return [...byKey.values()].sort((a, b) => ORDER.indexOf(a.key as BuffKey) - ORDER.indexOf(b.key as BuffKey))
}

export function formatBuffValue(buff: MatchBuff): string {
  return `+${buff.attack} / +${buff.health}`
}

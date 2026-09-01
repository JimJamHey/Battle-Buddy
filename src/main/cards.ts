import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  catalogFromCardsJson,
  catalogHeroesFromCardsJson,
  catalogSummonsFromCardsJson,
  type RawCard
} from '../core/cards'
import type { DeathrattleSummon } from '../core/combatSim'
import type { BgMinion } from '../core/types'

const CARDS_URL = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.json'

export interface CardCatalog {
  minions: BgMinion[]
  heroes: Record<string, string>
  summons: Record<string, DeathrattleSummon>
}

export async function readCachedCardCatalog(userData: string): Promise<CardCatalog> {
  const cachePath = join(userData, 'cards-cache.json')
  try {
    const raw = JSON.parse(await readFile(cachePath, 'utf8')) as CardCatalog | BgMinion[]
    if (Array.isArray(raw)) return { minions: raw, heroes: {}, summons: {} }
    return {
      minions: raw.minions ?? [],
      heroes: raw.heroes ?? {},
      summons: raw.summons ?? {}
    }
  } catch {
    return { minions: [], heroes: {}, summons: {} }
  }
}

export async function loadCardCatalog(
  userData: string,
  onRefresh?: (catalog: CardCatalog) => void
): Promise<CardCatalog> {
  const cachePath = join(userData, 'cards-cache.json')
  const cached = await readCachedCardCatalog(userData)

  if (cached.minions.length) {
    void refreshCardCatalog(cachePath, cached).then((next) => {
      if (next.minions.length) onRefresh?.(next)
    })
    return cached
  }
  return refreshCardCatalog(cachePath, cached)
}

async function refreshCardCatalog(cachePath: string, fallback: CardCatalog): Promise<CardCatalog> {
  try {
    const res = await fetch(CARDS_URL, {
      headers: { 'user-agent': 'BattleBuddy/0.1' }
    })
    if (!res.ok) throw new Error(`cards.json HTTP ${res.status}`)
    const json = (await res.json()) as RawCard[]
    const minions = catalogFromCardsJson(json)
    const heroes = catalogHeroesFromCardsJson(json)
    const summons = catalogSummonsFromCardsJson(json)
    if (minions.length) {
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(cachePath, JSON.stringify({ minions, heroes, summons }))
      return { minions, heroes, summons }
    }
  } catch (err) {
    if (fallback.minions.length) return fallback
    throw err
  }
  return fallback
}

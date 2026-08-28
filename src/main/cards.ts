import { existsSync } from 'node:fs'
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

export async function loadCardCatalog(userData: string): Promise<CardCatalog> {
  const cachePath = join(userData, 'cards-cache.json')
  let cached: CardCatalog = { minions: [], heroes: {}, summons: {} }
  try {
    const raw = JSON.parse(await readFile(cachePath, 'utf8')) as CardCatalog | BgMinion[]
    if (Array.isArray(raw)) cached = { minions: raw, heroes: {}, summons: {} }
    else cached = { minions: raw.minions ?? [], heroes: raw.heroes ?? {}, summons: raw.summons ?? {} }
  } catch {
    cached = { minions: [], heroes: {}, summons: {} }
  }

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
    if (cached.minions.length) return cached
    throw err
  }
  return cached
}

export function cacheExists(userData: string): boolean {
  return existsSync(join(userData, 'cards-cache.json'))
}

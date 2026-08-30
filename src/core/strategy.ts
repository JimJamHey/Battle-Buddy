import { TRIBE_ORDER, canonicalTribe, sortTribes, tribeSlug } from './heroes'
import { cardMechanics } from './mechanics'
import { relatedTribes } from './pool'
import type { BgMinion } from './types'

/** Mechanics that usually define a Battlegrounds direction, not keywords like Taunt. */
export const CLUSTER_MECHANICS = [
  'Deathrattle',
  'Battlecry',
  'Rally',
  'Avenge',
  'Magnetic',
  'Spellcraft',
  'End of Turn',
  'Start of Combat',
  'Reborn',
  'Divine Shield'
] as const

export type ClusterMechanic = (typeof CLUSTER_MECHANICS)[number]

export interface StrategyCardRef {
  id: string
  name: string
  techLevel: number
}

export type StrategyStatus = 'candidate' | 'curated' | 'stale'

export interface StrategyComp {
  id: string
  name: string
  tribes: string[]
  mechanic: string | null
  core: StrategyCardRef[]
  support: StrategyCardRef[]
  status: StrategyStatus
  reason?: string
  commitWhen?: string
  notes?: string
}

export interface SnapshotCard {
  id: string
  dbfId: number
  name: string
  text: string
  attack: number
  health: number
  techLevel: number
  tribes: string[]
  kind: BgMinion['kind']
  mechanics: string[]
}

export interface PoolSnapshot {
  fetchedAt: string
  source: string
  build: string | null
  cards: SnapshotCard[]
}

export interface PoolDiff {
  buildFrom: string | null
  buildTo: string | null
  added: SnapshotCard[]
  removed: SnapshotCard[]
  changed: Array<{ id: string; name: string; fields: string[] }>
}

export interface CuratedComp {
  id: string
  name: string
  tribes: string[]
  mechanic?: string | null
  coreIds: string[]
  supportIds?: string[]
  commitWhen?: string
  notes?: string
}

export interface CuratedFile {
  skillBand: string
  notes?: string
  comps: CuratedComp[]
}

const CORE_TIER = 4
const MIN_CLUSTER = 4
const MIN_CORE = 2

export function snapshotCard(card: BgMinion): SnapshotCard {
  return {
    id: card.id,
    dbfId: card.dbfId,
    name: card.name,
    text: card.text,
    attack: card.attack,
    health: card.health,
    techLevel: card.techLevel,
    tribes: card.tribes,
    kind: card.kind,
    mechanics: card.mechanics ?? cardMechanics(card)
  }
}

export function snapshotFromCatalog(
  cards: BgMinion[],
  meta: { source: string; build: string | null; fetchedAt?: string }
): PoolSnapshot {
  return {
    fetchedAt: meta.fetchedAt ?? new Date().toISOString(),
    source: meta.source,
    build: meta.build,
    cards: cards.map(snapshotCard)
  }
}

export function parseHsjsonBuild(url: string): string | null {
  const match = url.match(/\/v1\/(\d+)\//)
  return match?.[1] ?? null
}

/** Highest numbered folder on the HearthstoneJSON `/v1/` index (`/latest/` no longer redirects). */
export function latestHsjsonBuild(indexHtml: string): string | null {
  let max = 0
  for (const match of indexHtml.matchAll(/href="\/v1\/(\d+)\/"/g)) {
    const n = Number(match[1])
    if (n > max) max = n
  }
  return max ? String(max) : null
}

function cardFingerprint(card: SnapshotCard): string {
  return [
    card.name,
    card.text,
    card.attack,
    card.health,
    card.techLevel,
    card.kind,
    [...card.tribes].sort().join(','),
    [...card.mechanics].sort().join(',')
  ].join('|')
}

function changedFields(prev: SnapshotCard, next: SnapshotCard): string[] {
  const fields: Array<keyof SnapshotCard> = [
    'name',
    'text',
    'attack',
    'health',
    'techLevel',
    'kind',
    'tribes',
    'mechanics'
  ]
  return fields.filter((field) => JSON.stringify(prev[field]) !== JSON.stringify(next[field]))
}

export function diffSnapshots(prev: PoolSnapshot | null, next: PoolSnapshot): PoolDiff {
  if (!prev) {
    return {
      buildFrom: null,
      buildTo: next.build,
      added: next.cards,
      removed: [],
      changed: []
    }
  }
  const before = new Map(prev.cards.map((card) => [card.id, card]))
  const after = new Map(next.cards.map((card) => [card.id, card]))
  const added: SnapshotCard[] = []
  const removed: SnapshotCard[] = []
  const changed: PoolDiff['changed'] = []
  for (const card of next.cards) {
    const old = before.get(card.id)
    if (!old) added.push(card)
    else if (cardFingerprint(old) !== cardFingerprint(card)) {
      changed.push({ id: card.id, name: card.name, fields: changedFields(old, card) })
    }
  }
  for (const card of prev.cards) {
    if (!after.has(card.id)) removed.push(card)
  }
  return { buildFrom: prev.build, buildTo: next.build, added, removed, changed }
}

export function tribesForStrategy(card: BgMinion): string[] {
  const typed = sortTribes(
    card.tribes.map((tribe) => canonicalTribe(tribe) ?? '').filter(Boolean)
  )
  if (typed.length) return typed
  return relatedTribes(card)
}

function asRef(card: BgMinion): StrategyCardRef {
  return { id: card.id, name: card.name, techLevel: card.techLevel }
}

function byTierName(a: BgMinion, b: BgMinion): number {
  if (a.techLevel !== b.techLevel) return a.techLevel - b.techLevel
  return a.name.localeCompare(b.name)
}

function clusterId(tribe: string, mechanic: string): string {
  return `${tribeSlug(tribe)}-${mechanic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * Build mid-skill candidate comps from the live pool: tribe + payoff mechanic,
 * not a copied high-MMR guide. Humans promote these into curated.json.
 */
export function strategyCandidates(cards: BgMinion[], minCards = MIN_CLUSTER): StrategyComp[] {
  const minions = cards.filter((card) => card.kind === 'minion')
  const comps: StrategyComp[] = []
  for (const tribe of TRIBE_ORDER) {
    const tribeCards = minions.filter((card) => tribesForStrategy(card).includes(tribe))
    for (const mechanic of CLUSTER_MECHANICS) {
      const hits = tribeCards.filter((card) => cardMechanics(card).includes(mechanic)).sort(byTierName)
      if (hits.length < minCards) continue
      const core = hits.filter((card) => card.techLevel >= CORE_TIER)
      const support = hits.filter((card) => card.techLevel < CORE_TIER)
      if (core.length < MIN_CORE) continue
      comps.push({
        id: clusterId(tribe, mechanic),
        name: `${tribe} ${mechanic}`,
        tribes: [tribe],
        mechanic,
        core: core.map(asRef),
        support: support.map(asRef),
        status: 'candidate'
      })
    }
  }
  return comps
}

export function markStale(comps: StrategyComp[], poolIds: Set<string>): StrategyComp[] {
  return comps.map((comp) => {
    const missing = comp.core.filter((card) => !poolIds.has(card.id)).map((card) => card.name)
    if (!missing.length) return comp
    return {
      ...comp,
      status: 'stale' as const,
      reason: `Core cards left the pool: ${missing.join(', ')}`
    }
  })
}

export function reviewCurated(file: CuratedFile, pool: BgMinion[]): StrategyComp[] {
  const byId = new Map(pool.map((card) => [card.id, card]))
  const comps: StrategyComp[] = file.comps.map((row) => {
    const resolve = (ids: string[]): StrategyCardRef[] =>
      ids.map((id) => {
        const card = byId.get(id)
        return card ? asRef(card) : { id, name: id, techLevel: 0 }
      })
    return {
      id: row.id,
      name: row.name,
      tribes: row.tribes,
      mechanic: row.mechanic ?? null,
      core: resolve(row.coreIds),
      support: resolve(row.supportIds ?? []),
      status: 'curated' as const,
      commitWhen: row.commitWhen,
      notes: row.notes
    }
  })
  return markStale(comps, new Set(pool.map((card) => card.id)))
}

export function overlayStrategies(
  pool: BgMinion[],
  lobbyTribes: string[],
  curated: CuratedFile,
  limit = 6
): StrategyComp[] {
  const wanted = new Set(lobbyTribes.map((tribe) => tribe.toLowerCase()).filter((t) => t && t !== 'buddy'))
  const fits = (comp: StrategyComp) => {
    if (comp.status === 'stale') return false
    if (!wanted.size) return true
    return comp.tribes.every((tribe) => wanted.has(tribe.toLowerCase()))
  }
  const curatedRows = reviewCurated(curated, pool).filter(fits)
  const seen = new Set(curatedRows.map((row) => row.id))
  const candidates = strategyCandidates(pool).filter((row) => fits(row) && !seen.has(row.id))
  return [...curatedRows, ...candidates].slice(0, limit)
}

export function summarizeDiff(diff: PoolDiff, listLimit = 40): string {
  const lines = [
    `HSJSON ${diff.buildFrom ?? '(none)'} → ${diff.buildTo ?? 'unknown'}`,
    `+${diff.added.length} cards  -${diff.removed.length} cards  ~${diff.changed.length} changed`
  ]
  if (!diff.buildFrom && diff.added.length && !diff.removed.length && !diff.changed.length) {
    lines.push('(first snapshot — skipped listing every card)')
    return lines.join('\n')
  }
  const extra = (kind: string, n: number) => (n > listLimit ? `  … ${n - listLimit} more ${kind}` : null)
  for (const card of diff.removed.slice(0, listLimit)) lines.push(`- ${card.name} (${card.id})`)
  const moreRemoved = extra('removed', diff.removed.length)
  if (moreRemoved) lines.push(moreRemoved)
  for (const card of diff.added.slice(0, listLimit)) lines.push(`+ ${card.name} (${card.id}) T${card.techLevel}`)
  const moreAdded = extra('added', diff.added.length)
  if (moreAdded) lines.push(moreAdded)
  for (const row of diff.changed.slice(0, listLimit)) lines.push(`~ ${row.name} (${row.id}): ${row.fields.join(', ')}`)
  const moreChanged = extra('changed', diff.changed.length)
  if (moreChanged) lines.push(moreChanged)
  return lines.join('\n')
}

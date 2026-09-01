import type { BgMinion, SeenBoard, SeenMinion } from './types'
import { poolBaseId } from './cards'

export function pickLastSeenBoard(
  boards: SeenBoard[],
  opponentPlayerId: number | null
): SeenBoard | null {
  if (opponentPlayerId != null) {
    const hit = boards.find((board) => board.playerId === opponentPlayerId)
    if (hit) return hit
  }
  return boards.at(-1) ?? null
}

export function printedStats(
  card: Pick<BgMinion, 'attack' | 'health'> | undefined,
  golden: boolean
): { attack: number; health: number } | null {
  if (!card) return null
  const mul = golden ? 2 : 1
  return { attack: card.attack * mul, health: card.health * mul }
}

export function liveTone(
  live: number,
  printed: number | undefined,
  kind: 'atk' | 'hp'
): 'boosted' | 'damaged' | null {
  if (printed == null) return null
  if (live > printed) return 'boosted'
  if (kind === 'hp' && live < printed) return 'damaged'
  return null
}

export function catalogForSeen(minion: SeenMinion, catalog: BgMinion[]): BgMinion | undefined {
  const baseId = poolBaseId(minion.cardId)
  return (
    catalog.find((row) => row.id === minion.cardId) ??
    catalog.find((row) => row.id === baseId) ??
    catalog.find((row) => row.name.toLowerCase() === (minion.name || '').toLowerCase())
  )
}

export function isGainedKeyword(
  live: boolean,
  card: Pick<BgMinion, 'mechanics'> | undefined,
  ...names: string[]
): boolean {
  if (!live) return false
  const printed = card?.mechanics ?? []
  if (!printed.length) return true
  const set = new Set(printed.map((name) => name.toLowerCase()))
  return !names.some((name) => set.has(name.toLowerCase()))
}

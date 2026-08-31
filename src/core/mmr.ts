import { isPlaceholderName, normalizeName } from './parser'
import type { LeaderboardEntry, LobbyMmrRow, LobbyPlayer } from './types'

export function leaderboardAccountId(rawName: string): string {
  return rawName.replace(/#\d+$/, '').trim()
}

export function indexLeaderboard(rows: LeaderboardEntry[]): Map<string, LeaderboardEntry> {
  const map = new Map<string, LeaderboardEntry>()
  for (const row of rows) {
    map.set(row.accountid.trim().toLowerCase(), row)
  }
  return map
}

export function matchLobby(
  lobby: LobbyPlayer[],
  board: Map<string, LeaderboardEntry>,
  selfBattleTag: string,
  opts?: {
    spectating?: boolean
    watchedPlayerId?: number | null
    heroNames?: Record<string, string>
  }
): LobbyMmrRow[] {
  const self = normalizeName(selfBattleTag)
  const spectating = Boolean(opts?.spectating)
  const watched = opts?.watchedPlayerId ?? null
  const heroes = opts?.heroNames ?? {}
  const rows: LobbyMmrRow[] = lobby.map((player) => {
    const unknownName = isPlaceholderName(player.rawName)
    const key = normalizeName(player.rawName)
    const entry = unknownName ? undefined : board.get(key)
    const isSelf = spectating
      ? watched != null && player.playerId === watched
      : Boolean(self) && (key === self || normalizeName(leaderboardAccountId(player.rawName)) === self)
    const heroName =
      player.heroName ||
      (player.heroCardId
        ? heroes[player.heroCardId] ?? heroes[player.heroCardId.replace(/_SKIN_.*$/, '')] ?? null
        : null)
    const displayName = unknownName
      ? `Player ${player.playerId}`
      : leaderboardAccountId(player.rawName)
    return {
      playerId: player.playerId,
      name: displayName,
      isSelf,
      rating: entry?.rating ?? null,
      rank: entry?.rank ?? null,
      unknownName,
      belowCutoff: !unknownName && !entry,
      heroName: heroName ?? null,
      heroCardId: player.heroCardId ?? null,
      place: player.place ?? null
    }
  })

  if (!spectating && self && !rows.some((r) => r.isSelf)) {
    const mine = board.get(self)
    rows.unshift({
      playerId: -1,
      name: leaderboardAccountId(selfBattleTag) || selfBattleTag,
      isSelf: true,
      rating: mine?.rating ?? null,
      rank: mine?.rank ?? null,
      unknownName: false,
      belowCutoff: !mine
    })
  }

  return rows.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
    const ap = a.place ?? 99
    const bp = b.place ?? 99
    if (ap !== bp) return ap - bp
    const ar = a.rating ?? -1
    const br = b.rating ?? -1
    if (ar !== br) return br - ar
    return a.name.localeCompare(b.name)
  })
}

export interface LeaderboardPage {
  seasonId?: number
  leaderboard?: {
    rows?: Array<{ accountid?: string; rating?: number; rank?: number }>
    pagination?: { totalPages?: number; totalSize?: number }
  }
}

export function rowsFromPage(page: LeaderboardPage): LeaderboardEntry[] {
  const rows = page.leaderboard?.rows ?? []
  const out: LeaderboardEntry[] = []
  for (const row of rows) {
    if (!row.accountid || typeof row.rating !== 'number' || typeof row.rank !== 'number') continue
    out.push({ accountid: row.accountid, rating: row.rating, rank: row.rank })
  }
  return out
}

export function leaderboardUrl(region: string, page: number, seasonId?: number): string {
  const params = new URLSearchParams({
    region,
    leaderboardId: 'battlegrounds',
    page: String(page)
  })
  if (seasonId) params.set('seasonId', String(seasonId))
  return `https://hearthstone.blizzard.com/en-us/api/community/leaderboardsData?${params.toString()}`
}

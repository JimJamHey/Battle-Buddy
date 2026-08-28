import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { leaderboardUrl, rowsFromPage, type LeaderboardPage } from '../core/mmr'
import type { LeaderboardEntry, Region } from '../core/types'

const MAX_PAGES = 400
const PAGE_DELAY_MS = 50
const REFRESH_MS = 20 * 60 * 1000
const CACHE_VERSION = 2

interface CacheFile {
  version?: number
  region: Region
  fetchedAt: number
  rows: LeaderboardEntry[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function loadLeaderboardCache(userData: string, region: Region): Promise<LeaderboardEntry[]> {
  try {
    const raw = JSON.parse(await readFile(join(userData, 'leaderboard-cache.json'), 'utf8')) as CacheFile
    if (raw.version !== CACHE_VERSION) return []
    if (raw.region === region && Array.isArray(raw.rows)) return raw.rows
  } catch {
    /* no cache */
  }
  return []
}

export async function refreshLeaderboard(
  userData: string,
  region: Region,
  onProgress?: (rows: LeaderboardEntry[]) => void
): Promise<LeaderboardEntry[]> {
  const rows: LeaderboardEntry[] = []
  const seen = new Set<string>()
  let totalPages = MAX_PAGES
  let seasonId: number | undefined
  for (let page = 1; page <= Math.min(MAX_PAGES, totalPages); page++) {
    const res = await fetch(leaderboardUrl(region, page, seasonId), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        accept: 'application/json'
      }
    })
    if (!res.ok) break
    const json = (await res.json()) as LeaderboardPage
    if (json.seasonId && !seasonId) seasonId = json.seasonId
    const pageRows = rowsFromPage(json)
    if (json.leaderboard?.pagination?.totalPages) {
      totalPages = json.leaderboard.pagination.totalPages
    }
    if (!pageRows.length) break
    for (const row of pageRows) {
      const key = row.accountid.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
    onProgress?.(rows)
    await sleep(PAGE_DELAY_MS)
  }
  if (rows.length) {
    const payload: CacheFile = { version: CACHE_VERSION, region, fetchedAt: Date.now(), rows }
    await mkdir(userData, { recursive: true })
    await writeFile(join(userData, 'leaderboard-cache.json'), JSON.stringify(payload))
  }
  return rows
}

export function cacheIsFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < REFRESH_MS
}

export async function cacheTimestamp(userData: string): Promise<number> {
  try {
    const raw = JSON.parse(await readFile(join(userData, 'leaderboard-cache.json'), 'utf8')) as CacheFile
    if (raw.version !== CACHE_VERSION) return 0
    return raw.fetchedAt ?? 0
  } catch {
    return 0
  }
}

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Region } from '../core/types'

export function battleNetConfigPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library/Application Support/Battle.net/Battle.net.config')
  }
  return join(process.env.APPDATA || join(homedir(), 'AppData/Roaming'), 'Battle.net', 'Battle.net.config')
}

export function mapBattleNetRegion(raw: string): Region | null {
  const u = raw.trim().toUpperCase()
  if (u === 'US' || u === 'NA' || u === 'AMERICAS' || u === 'AMERICA') return 'US'
  if (u === 'EU' || u === 'EUROPE') return 'EU'
  if (u === 'KR' || u === 'TW' || u === 'AP' || u === 'SEA' || u === 'ASIA' || u === 'CN') return 'AP'
  return null
}

function walkForRegion(value: unknown, found: Region[]): void {
  if (found.length) return
  if (Array.isArray(value)) {
    for (const item of value) walkForRegion(item, found)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (/region/i.test(key) && typeof nested === 'string') {
      const mapped = mapBattleNetRegion(nested)
      if (mapped) {
        found.push(mapped)
        return
      }
    }
    walkForRegion(nested, found)
  }
}

export async function detectBattleNetRegion(): Promise<Region | null> {
  try {
    const json = JSON.parse(await readFile(battleNetConfigPath(), 'utf8')) as unknown
    const found: Region[] = []
    walkForRegion(json, found)
    return found[0] ?? null
  } catch {
    return null
  }
}

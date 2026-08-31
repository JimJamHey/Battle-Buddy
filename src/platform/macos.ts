import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { GameHost, Rect } from './types'

const execFileAsync = promisify(execFile)

function helperPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(process.resourcesPath || '', 'mac-host'),
    join(here, '../../resources/mac-host'),
    join(process.cwd(), 'resources/mac-host')
  ]
  return candidates.find((path) => path && existsSync(path)) ?? null
}

async function helper(args: string[], timeout = 4000): Promise<string | null> {
  const bin = helperPath()
  if (!bin) return null
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout })
    return stdout.trim()
  } catch {
    return null
  }
}

async function osascript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 3000 })
  return stdout.trim()
}

function parseRect(raw: string | null): Rect | null {
  if (!raw) return null
  const [x, y, width, height] = raw.split(',').map((n) => Number(n.trim()))
  if (![x, y, width, height].every((n) => Number.isFinite(n)) || width < 80 || height < 80) return null
  return { x, y, width, height }
}

export const macHost: GameHost = {
  processName: () => 'Hearthstone',

  defaultInstallPath: () => '/Applications/Hearthstone',

  logConfigPath: () => join(homedir(), 'Library', 'Preferences', 'Blizzard', 'Hearthstone', 'log.config'),

  async findHearthstone() {
    const fromHelper = await helper(['present'])
    if (fromHelper === '1') return 1n
    if (fromHelper === '0') return null
    try {
      const out = await osascript(
        'tell application "System Events" to if exists process "Hearthstone" then return 1 else return 0'
      )
      return out === '1' ? 1n : null
    } catch {
      return null
    }
  },

  async isForeground() {
    const fromHelper = await helper(['front'])
    if (fromHelper === '1') return true
    if (fromHelper === '0') return false
    try {
      const out = await osascript(
        'tell application "System Events" to get name of first application process whose frontmost is true'
      )
      return out.trim() === 'Hearthstone'
    } catch {
      return false
    }
  },

  async getClientBounds(): Promise<Rect | null> {
    const fromHelper = parseRect(await helper(['bounds']))
    if (fromHelper) return fromHelper
    try {
      const out = await osascript(`
        tell application "System Events"
          if not (exists process "Hearthstone") then return ""
          tell process "Hearthstone"
            tell window 1
              set p to position
              set s to size
              return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)
            end tell
          end tell
        end tell
      `)
      return parseRect(out)
    } catch {
      return null
    }
  },

  async findInstallFromRunningProcess() {
    try {
      const out = await osascript('POSIX path of (path to application "Hearthstone")')
      if (!out) return null
      const cleaned = out.replace(/\/Hearthstone\.app\/?$/, '')
      return cleaned.replace(/\/$/, '') || '/Applications/Hearthstone'
    } catch {
      return '/Applications/Hearthstone'
    }
  }
}

export async function macOcrRegion(x: number, y: number, width: number, height: number): Promise<string> {
  const text = await helper(
    ['ocr', String(Math.round(x)), String(Math.round(y)), String(Math.round(width)), String(Math.round(height))],
    16000
  )
  return text ?? ''
}

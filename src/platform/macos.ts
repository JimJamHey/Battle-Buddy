import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { GameHost, Rect } from './types'

const execFileAsync = promisify(execFile)

async function osascript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 3000 })
  return stdout.trim()
}

export const macHost: GameHost = {
  processName: () => 'Hearthstone',

  defaultInstallPath: () => '/Applications/Hearthstone',

  logConfigPath: () => join(homedir(), 'Library', 'Preferences', 'Blizzard', 'Hearthstone', 'log.config'),

  async findHearthstone() {
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
    try {
      const out = await osascript(`
        tell application "System Events"
          if not (exists process "Hearthstone") then return ""
          tell process "Hearthstone"
            tell window 1
              set p to position
              set s to size
              set fs to false
              try
                set fs to value of attribute "AXFullScreen"
              end try
              set titleH to 0
              if fs is not true then set titleH to 28
              return (item 1 of p as text) & "," & ((item 2 of p) + titleH as text) & "," & (item 1 of s as text) & "," & ((item 2 of s) - titleH as text)
            end tell
          end tell
        end tell
      `)
      if (!out) return null
      const [x, y, width, height] = out.split(',').map((n) => Number(n.trim()))
      if (![x, y, width, height].every((n) => Number.isFinite(n)) || width < 80 || height < 80) return null
      return { x, y, width, height }
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

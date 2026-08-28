import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const SESSION_LOG_DIR = /^Hearthstone_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/

export function selectSessionLogDir(
  entries: Array<{ name: string; mtimeMs: number; hasPowerLog: boolean }>
): string | null {
  const sessions = entries.filter((entry) => SESSION_LOG_DIR.test(entry.name) && entry.hasPowerLog)
  if (!sessions.length) return null
  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return sessions[0].name
}

/** Hearthstone now writes Power.log under Logs/Hearthstone_YYYY_MM_DD_HH_MM_SS/. */
export function resolveLogsDirectory(installPath: string): string | null {
  const root = join(installPath, 'Logs')
  if (!existsSync(root)) return null
  const entries: Array<{ name: string; mtimeMs: number; hasPowerLog: boolean }> = []
  try {
    for (const name of readdirSync(root)) {
      if (!SESSION_LOG_DIR.test(name)) continue
      const full = join(root, name)
      try {
        const st = statSync(full)
        if (!st.isDirectory()) continue
        const power = join(full, 'Power.log')
        const hasPowerLog = existsSync(power)
        entries.push({
          name,
          mtimeMs: hasPowerLog ? statSync(power).mtimeMs : st.mtimeMs,
          hasPowerLog
        })
      } catch {
        /* ignore one bad folder */
      }
    }
  } catch {
    return root
  }
  const session = selectSessionLogDir(entries)
  if (session) return join(root, session)
  if (existsSync(join(root, 'Power.log'))) return root
  return root
}

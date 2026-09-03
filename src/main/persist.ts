import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings, type SessionState } from '../core/types'
import { sanitizeSettings } from '../core/settings'
import { emptySession, ensureToday, hydrateGameMmr } from '../core/session'

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, path)
}

export function paths(userData: string) {
  return {
    settings: join(userData, 'config.json'),
    session: join(userData, 'session.json')
  }
}

export async function loadSettings(userData: string): Promise<AppSettings> {
  const saved = await readJson<Partial<AppSettings> & { settingsRev?: number }>(
    paths(userData).settings,
    {}
  )
  const rev = typeof saved.settingsRev === 'number' ? saved.settingsRev : 0
  // Rev 1: MMR OCR testing left capture guides + unlocked layout on — restore a clean overlay.
  if (rev < 1) {
    if (saved.layoutUnlocked === true) saved.layoutUnlocked = false
  }
  // Rev 2: dock CSS was missing and combat sat off-center — reset layout to defaults.
  if (rev < 2) {
    saved.overlayLayout = DEFAULT_SETTINGS.overlayLayout
    saved.layoutUnlocked = false
  }
  const next = sanitizeSettings(DEFAULT_SETTINGS, saved)
  if (rev < 2) {
    await writeJson(paths(userData).settings, { ...next, settingsRev: 2 })
  }
  return next
}

export async function saveSettings(userData: string, settings: AppSettings): Promise<void> {
  await writeJson(paths(userData).settings, sanitizeSettings(DEFAULT_SETTINGS, settings))
}

export async function loadSession(userData: string): Promise<SessionState> {
  const saved = await readJson<SessionState>(paths(userData).session, emptySession())
  return hydrateGameMmr(ensureToday(saved))
}

export async function saveSession(userData: string, session: SessionState): Promise<void> {
  await writeJson(paths(userData).session, session)
}

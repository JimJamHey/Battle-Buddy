import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings, type SessionState } from '../core/types'
import { mergeOverlayLayout, migrateOverlayLayout } from '../core/layout'
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
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

export function paths(userData: string) {
  return {
    settings: join(userData, 'config.json'),
    session: join(userData, 'session.json')
  }
}

export async function loadSettings(userData: string): Promise<AppSettings> {
  const saved = await readJson<Partial<AppSettings>>(paths(userData).settings, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    overlayLayout: migrateOverlayLayout(
      mergeOverlayLayout(DEFAULT_SETTINGS.overlayLayout, saved.overlayLayout)
    ),
    layoutUnlocked: Boolean(saved.layoutUnlocked),
    keepFullscreenOverlay: saved.keepFullscreenOverlay ?? true,
    showLobbyOnOverlay: false,
    showSessionOnOverlay: saved.showSessionOnOverlay ?? true,
    currentMmr: typeof saved.currentMmr === 'number' ? saved.currentMmr : saved.currentMmr ?? null
  }
}

export async function saveSettings(userData: string, settings: AppSettings): Promise<void> {
  await mkdir(userData, { recursive: true })
  await writeFile(paths(userData).settings, JSON.stringify(settings, null, 2), 'utf8')
}

export async function loadSession(userData: string): Promise<SessionState> {
  const saved = await readJson<SessionState>(paths(userData).session, emptySession())
  return hydrateGameMmr(ensureToday(saved))
}

export async function saveSession(userData: string, session: SessionState): Promise<void> {
  await mkdir(userData, { recursive: true })
  await writeFile(paths(userData).session, JSON.stringify(session, null, 2), 'utf8')
}

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../core/types'

const REPO = { owner: 'JimJamHey', repo: 'Battle-Buddy' }

export type UpdateListener = () => void

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowPrerelease = false

export class AppUpdater {
  state: UpdateState = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: 0,
    dismissed: false,
    canInstall: app.isPackaged
  }

  constructor(private readonly onChange: UpdateListener) {
    autoUpdater.on('checking-for-update', () => {
      this.patch({ phase: 'checking' })
    })
    autoUpdater.on('update-available', (info) => {
      this.patch({
        phase: 'available',
        availableVersion: info.version,
        dismissed: this.state.dismissed && this.state.availableVersion === info.version
      })
    })
    autoUpdater.on('update-not-available', () => {
      this.patch({ phase: 'unavailable', availableVersion: null })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.patch({ phase: 'downloading', progress: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.patch({
        phase: 'ready',
        availableVersion: info.version,
        progress: 100,
        dismissed: false
      })
    })
    autoUpdater.on('error', () => {
      if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
        this.patch({ phase: 'error' })
      }
    })
  }

  async check(): Promise<void> {
    this.state.currentVersion = app.getVersion()
    if (!app.isPackaged && process.env.BATTLEBUDDY_PREVIEW_UPDATE === '1') {
      this.patch({
        phase: 'available',
        availableVersion: '9.9.9',
        dismissed: false,
        canInstall: false
      })
      return
    }
    if (!app.isPackaged) {
      await this.checkGithubLatest()
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      await this.checkGithubLatest()
    }
  }

  async download(): Promise<void> {
    this.patch({ dismissed: false, phase: 'downloading', progress: 0 })
    if (!app.isPackaged) {
      this.patch({ phase: 'error' })
      return
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch {
      this.patch({ phase: 'error' })
    }
  }

  install(): void {
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall(false, true)
  }

  dismiss(): void {
    this.patch({ dismissed: true })
  }

  private patch(partial: Partial<UpdateState>): void {
    this.state = { ...this.state, ...partial }
    this.onChange()
  }

  private async checkGithubLatest(): Promise<void> {
    this.patch({ phase: 'checking' })
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'BattleBuddy' }
      })
      if (res.status === 404) {
        this.patch({ phase: 'unavailable', availableVersion: null })
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { tag_name?: string }
      const latest = (json.tag_name ?? '').replace(/^v/i, '')
      if (latest && this.isNewer(latest, app.getVersion())) {
        this.patch({
          phase: 'available',
          availableVersion: latest,
          dismissed: this.state.availableVersion === latest ? this.state.dismissed : false
        })
        return
      }
      this.patch({ phase: 'unavailable', availableVersion: latest || null })
    } catch {
      this.patch({ phase: 'unavailable' })
    }
  }

  private isNewer(latest: string, current: string): boolean {
    const a = latest.split('.').map((n) => Number(n) || 0)
    const b = current.split('.').map((n) => Number(n) || 0)
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      if ((a[i] ?? 0) > (b[i] ?? 0)) return true
      if ((a[i] ?? 0) < (b[i] ?? 0)) return false
    }
    return false
  }
}

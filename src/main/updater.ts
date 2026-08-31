import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../core/types'
import { isNewerVersion, isPrerelease } from '../core/version'

const REPO = { owner: 'JimJamHey', repo: 'Battle-Buddy' }

export type UpdateListener = () => void

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function followPrerelease(version = app.getVersion()): boolean {
  return isPrerelease(version)
}

export class AppUpdater {
  state: UpdateState = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: 0,
    dismissed: false,
    canInstall: app.isPackaged,
    errorMessage: null
  }

  constructor(private readonly onChange: UpdateListener) {
    autoUpdater.allowPrerelease = followPrerelease()
    autoUpdater.on('checking-for-update', () => {
      this.patch({ phase: 'checking', errorMessage: null })
    })
    autoUpdater.on('update-available', (info) => {
      this.patch({
        phase: 'available',
        availableVersion: info.version,
        dismissed: this.state.dismissed && this.state.availableVersion === info.version,
        errorMessage: null
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
        dismissed: false,
        errorMessage: null
      })
    })
    autoUpdater.on('error', (err) => {
      if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
        this.patch({
          phase: 'error',
          errorMessage: err instanceof Error ? err.message : 'Update failed'
        })
      }
    })
  }

  async check(): Promise<void> {
    this.state.currentVersion = app.getVersion()
    autoUpdater.allowPrerelease = followPrerelease(this.state.currentVersion)
    if (!app.isPackaged && process.env.BATTLEBUDDY_PREVIEW_UPDATE === '1') {
      this.patch({
        phase: 'available',
        availableVersion: '9.9.9',
        dismissed: false,
        canInstall: false,
        errorMessage: null
      })
      return
    }
    if (!app.isPackaged) {
      await this.checkGithubLatest()
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.patch({
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Could not reach GitHub for updates'
      })
      await this.checkGithubLatest()
    }
  }

  async download(): Promise<void> {
    this.patch({ dismissed: false, phase: 'downloading', progress: 0, errorMessage: null })
    if (!app.isPackaged) {
      this.patch({ phase: 'error', errorMessage: 'Dev builds cannot auto-install updates' })
      return
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.patch({
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Download failed'
      })
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
      const allowPre = followPrerelease(app.getVersion())
      const fromTest = allowPre
        ? await this.readPublishedVersion(
            `https://github.com/${REPO.owner}/${REPO.repo}/releases/download/test/latest.yml`
          )
        : null
      const fromLatest = await this.readPublishedVersion(
        `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest/download/latest.yml`
      )
      const latest = [fromTest, fromLatest]
        .filter(Boolean)
        .sort((a, b) => (isNewerVersion(a!, b!, { allowPrerelease: allowPre }) ? -1 : 1))[0]
      if (latest && isNewerVersion(latest, app.getVersion(), { allowPrerelease: allowPre })) {
        this.patch({
          phase: 'available',
          availableVersion: latest,
          dismissed: this.state.availableVersion === latest ? this.state.dismissed : false,
          errorMessage: null
        })
        return
      }
      this.patch({ phase: 'unavailable', availableVersion: latest || null })
    } catch (err) {
      this.patch({
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Could not read GitHub releases'
      })
    }
  }

  private async readPublishedVersion(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'BattleBuddy' }, redirect: 'follow' })
      if (!res.ok) return null
      const text = await res.text()
      const match = text.match(/^version:\s*['"]?([^\s'"]+)/m)
      return match?.[1] ?? null
    } catch {
      return null
    }
  }
}

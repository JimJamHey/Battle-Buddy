import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, OverlaySnapshot } from '../core/types'

const api = {
  getState: (): Promise<OverlaySnapshot> => ipcRenderer.invoke('get-state'),
  setSettings: (patch: Partial<AppSettings>): Promise<OverlaySnapshot> =>
    ipcRenderer.invoke('set-settings', patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('pick-folder'),
  refreshLeaderboard: (): Promise<OverlaySnapshot> => ipcRenderer.invoke('refresh-leaderboard'),
  openLogs: (): Promise<void> => ipcRenderer.invoke('open-logs'),
  setClickThrough: (enabled: boolean) => ipcRenderer.send('click-through', enabled),
  setTier: (tier: number) => ipcRenderer.send('set-tier', tier),
  quit: () => ipcRenderer.send('quit-app'),
  checkUpdate: (): Promise<OverlaySnapshot> => ipcRenderer.invoke('update-check'),
  downloadUpdate: (): Promise<OverlaySnapshot> => ipcRenderer.invoke('update-download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update-install'),
  dismissUpdate: (): Promise<OverlaySnapshot> => ipcRenderer.invoke('update-dismiss'),
  openRelease: (): Promise<void> => ipcRenderer.invoke('open-release'),
  onState: (callback: (state: OverlaySnapshot) => void) => {
    const listener = (_event: unknown, state: OverlaySnapshot) => callback(state)
    ipcRenderer.on('state', listener)
    return () => {
      ipcRenderer.removeListener('state', listener)
    }
  }
}

contextBridge.exposeInMainWorld('battleBuddy', api)

export type BattleBuddyApi = typeof api

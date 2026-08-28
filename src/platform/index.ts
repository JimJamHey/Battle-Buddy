import type { GameHost } from './types'
import { macHost } from './macos'
import {
  pinOverlayToGame as pinWindowsOverlay,
  followGameWindow as followWindowsOverlay,
  isOverlayForeground as isWindowsOverlayForeground,
  ensureGameOverlayFriendly as ensureWindowsOverlayFriendly,
  currentDisplayMode as windowsDisplayMode,
  windowsHost
} from './windows'
import type { OverlayDisplayMode } from './borderless'

export function createGameHost(): GameHost {
  return process.platform === 'darwin' ? macHost : windowsHost
}

export function pinOverlayToGame(handle: Buffer, passClicks = true): void {
  if (process.platform === 'win32') pinWindowsOverlay(handle, passClicks)
}

export function followGameWindow(
  handle: Buffer,
  bounds: { x: number; y: number; width: number; height: number },
  passClicks = true
): void {
  if (process.platform === 'win32') followWindowsOverlay(handle, bounds, passClicks)
}

export function isOverlayForeground(handle: Buffer): boolean {
  if (process.platform !== 'win32') return false
  return isWindowsOverlayForeground(handle)
}

export function ensureGameOverlayFriendly(enabled: boolean): OverlayDisplayMode {
  if (process.platform !== 'win32') return 'unknown'
  return ensureWindowsOverlayFriendly(enabled)
}

export function currentDisplayMode(): OverlayDisplayMode {
  if (process.platform !== 'win32') return 'unknown'
  return windowsDisplayMode()
}

export type { GameHost, Rect } from './types'
export type { OverlayDisplayMode } from './borderless'

import type { Rect } from './types'

/** Win32 GWL_STYLE bits used to strip chrome into a composited fullscreen window. */
export const WS_BORDER = 0x00800000
export const WS_DLGFRAME = 0x00400000
export const WS_CAPTION = 0x00c00000
export const WS_THICKFRAME = 0x00040000
export const WS_SYSMENU = 0x00080000
export const WS_MINIMIZEBOX = 0x00020000
export const WS_MAXIMIZEBOX = 0x00010000
export const WS_VISIBLE = 0x10000000
export const WS_POPUP = 0x80000000
export const WINDOW_CHROME =
  WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU | WS_BORDER | WS_DLGFRAME

/** SHQueryUserNotificationState value when a D3D swap chain owns the display. */
export const QUNS_RUNNING_D3D_FULL_SCREEN = 3

export type OverlayDisplayMode = 'unknown' | 'windowed' | 'borderless' | 'exclusive'

export function overlapRatio(window: Rect, monitor: Rect): number {
  const overlapW = Math.max(
    0,
    Math.min(window.x + window.width, monitor.x + monitor.width) - Math.max(window.x, monitor.x)
  )
  const overlapH = Math.max(
    0,
    Math.min(window.y + window.height, monitor.y + monitor.height) - Math.max(window.y, monitor.y)
  )
  const area = monitor.width * monitor.height
  if (area <= 0) return 0
  return (overlapW * overlapH) / area
}

export function coversMonitor(window: Rect, monitor: Rect, ratio = 0.9): boolean {
  return overlapRatio(window, monitor) >= ratio
}

export function hasWindowChrome(style: number): boolean {
  return (style & WINDOW_CHROME) !== 0
}

export function borderlessStyle(style: number): number {
  return ((style & ~WINDOW_CHROME) | WS_POPUP | WS_VISIBLE) >>> 0
}

export function sameRect(a: Rect, b: Rect, slop = 4): boolean {
  return (
    Math.abs(a.x - b.x) <= slop &&
    Math.abs(a.y - b.y) <= slop &&
    Math.abs(a.width - b.width) <= slop &&
    Math.abs(a.height - b.height) <= slop
  )
}

export function isD3dExclusive(quns: number): boolean {
  return quns === QUNS_RUNNING_D3D_FULL_SCREEN
}

export function overlayDisplayMode(input: {
  exclusive: boolean
  covers: boolean
  chrome: boolean
}): OverlayDisplayMode {
  if (input.exclusive) return 'exclusive'
  if (input.covers && !input.chrome) return 'borderless'
  return 'windowed'
}

/** Only exclusive D3D fullscreen needs a rewrite. Windowed and borderless already composite. */
export function shouldApplyBorderless(input: {
  enabled: boolean
  exclusive: boolean
  covers: boolean
  chrome: boolean
  window: Rect
  monitor: Rect
}): boolean {
  if (!input.enabled) return false
  return input.exclusive
}

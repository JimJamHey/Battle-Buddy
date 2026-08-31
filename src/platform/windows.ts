import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { hwndFromNativeHandle, isGameForeground } from './hwnd'
import {
  QUNS_RUNNING_D3D_FULL_SCREEN,
  borderlessStyle,
  coversMonitor,
  hasWindowChrome,
  overlayDisplayMode,
  shouldApplyBorderless,
  type OverlayDisplayMode
} from './borderless'
import { overlayExStyle } from './clickThrough'
import type { GameHost, Rect } from './types'

const require = createRequire(import.meta.url)

const execFileAsync = promisify(execFile)
const WINDOW_TITLES = ['Hearthstone', '하스스톤', '《爐石戰記》', '炉石传说']

const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const GA_ROOT = 2
const WS_EX_TOPMOST = 0x00000008
const WS_EX_WINDOWEDGE = 0x00000100
const WS_EX_CLIENTEDGE = 0x00000200
const WS_EX_DLGMODALFRAME = 0x00000001
const HWND_TOPMOST = -1
const HWND_NOTOPMOST = -2
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SWP_FRAMECHANGED = 0x0020
const SWP_SHOWWINDOW = 0x0040
const SWP_NOCOPYBITS = 0x0100
const MONITOR_DEFAULTTONEAREST = 2
const SW_RESTORE = 9
const EXCLUSIVE_RETRY_MS = 2500
const EXCLUSIVE_RETRY_LIMIT = 4

type Koffi = typeof import('koffi')

interface Native {
  koffi: Koffi
  FindWindowW: (cls: string | null, name: string | null) => unknown
  GetForegroundWindow: () => unknown
  GetAncestor: (hwnd: unknown, flags: number) => unknown
  IsWindow: (hwnd: unknown) => number
  IsIconic: (hwnd: unknown) => number
  GetClientRect: (hwnd: unknown, rect: { left: number; top: number; right: number; bottom: number }) => number
  GetWindowRect: (hwnd: unknown, rect: { left: number; top: number; right: number; bottom: number }) => number
  ClientToScreen: (hwnd: unknown, pt: { x: number; y: number }) => number
  GetWindowLongPtrW: (hwnd: unknown, index: number) => bigint | number
  SetWindowLongPtrW: (hwnd: unknown, index: number, value: bigint | number) => bigint | number
  SetWindowPos: (
    hwnd: unknown,
    after: unknown,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number
  ) => number
  GetWindowThreadProcessId: (hwnd: unknown, pid: { value: number }) => number
  MonitorFromWindow: (hwnd: unknown, flags: number) => unknown
  GetMonitorInfoW: (
    monitor: unknown,
    info: {
      cbSize: number
      rcMonitor: { left: number; top: number; right: number; bottom: number }
      rcWork: { left: number; top: number; right: number; bottom: number }
      dwFlags: number
    }
  ) => number
  ShowWindow: (hwnd: unknown, cmd: number) => number
  SHQueryUserNotificationState: (state: { value: number }) => number
  ChangeDisplaySettingsW: (mode: unknown, flags: number) => number
  monitorInfoSize: number
}

let native: Native | null = null
let cachedHwnd: unknown = null
let lastBorderlessKey = ''
let lastExclusiveApplyAt = 0
let exclusiveApplyTries = 0
let lastDisplayMode: OverlayDisplayMode = 'unknown'

function hwndOk(value: unknown): boolean {
  return value != null && value !== 0 && value !== 0n
}

function hwndBits(value: unknown): bigint {
  if (!hwndOk(value)) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  try {
    const addr = loadNative().koffi.address(value)
    if (typeof addr === 'bigint') return addr
    if (typeof addr === 'number' && Number.isFinite(addr)) return BigInt(Math.trunc(addr))
  } catch {
    /* ignore */
  }
  return 0n
}

function styleBits(value: bigint | number): number {
  return Number(BigInt(value) & 0xffffffffn)
}

function rectFromBox(box: { left: number; top: number; right: number; bottom: number }): Rect {
  return {
    x: box.left,
    y: box.top,
    width: Math.max(0, box.right - box.left),
    height: Math.max(0, box.bottom - box.top)
  }
}

function loadNative(): Native {
  if (native) return native
  const koffi = require('koffi') as Koffi
  const user32 = koffi.load('user32.dll')
  const shell32 = koffi.load('shell32.dll')
  const RECT = koffi.struct('RECT', {
    left: 'long',
    top: 'long',
    right: 'long',
    bottom: 'long'
  })
  const POINT = koffi.struct('POINT', {
    x: 'long',
    y: 'long'
  })
  const DWORD = koffi.struct('DWORDOUT', {
    value: 'uint32'
  })
  const QUNS = koffi.struct('QUNS', {
    value: 'int32'
  })
  const MONITORINFO = koffi.struct('MONITORINFO', {
    cbSize: 'uint32',
    rcMonitor: RECT,
    rcWork: RECT,
    dwFlags: 'uint32'
  })
  native = {
    koffi,
    FindWindowW: user32.func('void* __stdcall FindWindowW(str16 className, str16 windowName)'),
    GetForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()'),
    GetAncestor: user32.func('void* __stdcall GetAncestor(void *hWnd, uint32 gaFlags)'),
    IsWindow: user32.func('bool __stdcall IsWindow(void *hWnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
    GetClientRect: user32.func('bool __stdcall GetClientRect(void *hWnd, _Out_ RECT *lpRect)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hWnd, _Out_ RECT *lpRect)'),
    ClientToScreen: user32.func('bool __stdcall ClientToScreen(void *hWnd, _Inout_ POINT *lpPoint)'),
    GetWindowLongPtrW: user32.func('intptr __stdcall GetWindowLongPtrW(void *hWnd, int nIndex)'),
    SetWindowLongPtrW: user32.func('intptr __stdcall SetWindowLongPtrW(void *hWnd, int nIndex, intptr dwNewLong)'),
    SetWindowPos: user32.func(
      'bool __stdcall SetWindowPos(void *hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)'
    ),
    GetWindowThreadProcessId: user32.func(
      'uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ DWORDOUT *lpdwProcessId)'
    ),
    MonitorFromWindow: user32.func('void* __stdcall MonitorFromWindow(void *hWnd, uint32 dwFlags)'),
    GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(void *hMonitor, _Inout_ MONITORINFO *lpmi)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(void *hWnd, int nCmdShow)'),
    SHQueryUserNotificationState: shell32.func('int32 __stdcall SHQueryUserNotificationState(_Out_ QUNS *pquns)'),
    ChangeDisplaySettingsW: user32.func('int32 __stdcall ChangeDisplaySettingsW(void *lpDevMode, uint32 dwFlags)'),
    monitorInfoSize: koffi.sizeof(MONITORINFO) as number
  }
  void POINT
  void DWORD
  return native
}

function windowPid(hwnd: unknown): number {
  const pid = { value: 0 }
  loadNative().GetWindowThreadProcessId(hwnd, pid)
  return pid.value || 0
}

function findWindow(): unknown | null {
  const api = loadNative()
  if (hwndOk(cachedHwnd) && api.IsWindow(cachedHwnd)) return cachedHwnd
  cachedHwnd = null
  for (const title of WINDOW_TITLES) {
    const hwnd = api.FindWindowW('UnityWndClass', title)
    if (hwndOk(hwnd) && api.IsWindow(hwnd)) {
      cachedHwnd = hwnd
      return hwnd
    }
  }
  return null
}

function windowRect(hwnd: unknown): Rect | null {
  const api = loadNative()
  const box = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!api.GetWindowRect(hwnd, box)) return null
  const rect = rectFromBox(box)
  if (rect.width < 80 || rect.height < 80) return null
  return rect
}

function monitorRect(hwnd: unknown): Rect | null {
  const api = loadNative()
  const monitor = api.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)
  if (!hwndOk(monitor)) return null
  const info = {
    cbSize: api.monitorInfoSize,
    rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
    rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
    dwFlags: 0
  }
  if (!api.GetMonitorInfoW(monitor, info)) return null
  const rect = rectFromBox(info.rcMonitor)
  if (rect.width < 80 || rect.height < 80) return null
  return rect
}

function notificationState(): number {
  const state = { value: 0 }
  const hr = loadNative().SHQueryUserNotificationState(state)
  if (hr !== 0) return 0
  return state.value
}

function applyBorderless(hwnd: unknown, monitor: Rect): void {
  const api = loadNative()
  // Restore the desktop mode so a D3D exclusive swap chain loses the display.
  api.ChangeDisplaySettingsW(null, 0)
  api.ShowWindow(hwnd, SW_RESTORE)
  const style = styleBits(api.GetWindowLongPtrW(hwnd, GWL_STYLE))
  const nextStyle = borderlessStyle(style)
  if (nextStyle !== style) api.SetWindowLongPtrW(hwnd, GWL_STYLE, nextStyle)
  const ex = styleBits(api.GetWindowLongPtrW(hwnd, GWL_EXSTYLE))
  const nextEx = (ex & ~WS_EX_TOPMOST & ~WS_EX_WINDOWEDGE & ~WS_EX_CLIENTEDGE & ~WS_EX_DLGMODALFRAME) >>> 0
  if (nextEx !== ex) api.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, nextEx)
  api.SetWindowPos(
    hwnd,
    HWND_NOTOPMOST,
    monitor.x,
    monitor.y,
    monitor.width,
    monitor.height,
    SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOCOPYBITS
  )
}

export const windowsHost: GameHost = {
  processName: () => 'Hearthstone.exe',

  defaultInstallPath: () => {
    const pf = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)'
    return join(pf, 'Hearthstone')
  },

  logConfigPath: () =>
    join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Blizzard', 'Hearthstone', 'log.config'),

  async findHearthstone() {
    try {
      const hwnd = findWindow()
      return hwndOk(hwnd) ? 1n : null
    } catch {
      return null
    }
  },

  async isForeground() {
    try {
      const api = loadNative()
      const hwnd = findWindow()
      if (!hwndOk(hwnd)) return false
      const foreground = api.GetForegroundWindow()
      if (!hwndOk(foreground)) return false
      return isGameForeground({
        foreground: hwndBits(foreground),
        game: hwndBits(hwnd),
        foregroundPid: windowPid(foreground),
        gamePid: windowPid(hwnd),
        foregroundRoot: hwndBits(api.GetAncestor(foreground, GA_ROOT))
      })
    } catch {
      return false
    }
  },

  async getClientBounds(): Promise<Rect | null> {
    try {
      const api = loadNative()
      const hwnd = findWindow()
      if (!hwndOk(hwnd) || api.IsIconic(hwnd)) return null
      const rect = { left: 0, top: 0, right: 0, bottom: 0 }
      if (!api.GetClientRect(hwnd, rect)) return null
      const ul = { x: rect.left, y: rect.top }
      const lr = { x: Math.max(rect.left, rect.right - 1), y: Math.max(rect.top, rect.bottom - 1) }
      api.ClientToScreen(hwnd, ul)
      api.ClientToScreen(hwnd, lr)
      const width = lr.x - ul.x
      const height = lr.y - ul.y
      if (width < 80 || height < 80) return null
      return { x: ul.x, y: ul.y, width, height }
    } catch {
      return null
    }
  },

  async findInstallFromRunningProcess() {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-Command',
        "($p = Get-Process -Name Hearthstone -ErrorAction SilentlyContinue | Select-Object -First 1).Path"
      ], { windowsHide: true, timeout: 4000 })
      const path = stdout.trim().replace(/^['"]|['"]$/g, '')
      if (!path) return null
      return dirname(path)
    } catch {
      return null
    }
  }
}

/**
 * Independent TOPMOST overlay — do not parent it to Hearthstone.
 * Re-apply WS_EX_TRANSPARENT whenever we pin, or SetWindowPos eats click-through.
 */
export function pinOverlayToGame(overlayHandle: Buffer, passClicks = true): void {
  try {
    const api = loadNative()
    const overlay = hwndFromNativeHandle(overlayHandle)
    if (overlay === 0n) return
    const ex = styleBits(api.GetWindowLongPtrW(overlay, GWL_EXSTYLE))
    const next = overlayExStyle(ex, passClicks)
    if (next !== ex) api.SetWindowLongPtrW(overlay, GWL_EXSTYLE, next)
    api.SetWindowPos(
      overlay,
      HWND_TOPMOST,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED
    )
  } catch {
    /* overlay still follows the game window even if native pin fails */
  }
}

/**
 * Move/size the overlay with SetWindowPos (physical pixels) so it stays glued to
 * the Hearthstone client. Electron setBounds is slower and fights this on move.
 */
export function followGameWindow(overlayHandle: Buffer, bounds: Rect, passClicks = true): void {
  try {
    const api = loadNative()
    const overlay = hwndFromNativeHandle(overlayHandle)
    if (overlay === 0n || bounds.width < 80 || bounds.height < 80) return
    const ex = styleBits(api.GetWindowLongPtrW(overlay, GWL_EXSTYLE))
    const next = overlayExStyle(ex, passClicks)
    if (next !== ex) api.SetWindowLongPtrW(overlay, GWL_EXSTYLE, next)
    api.SetWindowPos(
      overlay,
      HWND_TOPMOST,
      Math.round(bounds.x),
      Math.round(bounds.y),
      Math.round(bounds.width),
      Math.round(bounds.height),
      SWP_NOACTIVATE | SWP_NOCOPYBITS
    )
  } catch {
    /* Electron still applies DIP bounds when native follow fails */
  }
}

export function isOverlayForeground(overlayHandle: Buffer): boolean {
  try {
    const api = loadNative()
    const overlay = hwndFromNativeHandle(overlayHandle)
    if (overlay === 0n) return false
    const foreground = api.GetForegroundWindow()
    if (!hwndOk(foreground)) return false
    const fg = hwndBits(foreground)
    if (fg === overlay) return true
    const root = hwndBits(api.GetAncestor(overlay, GA_ROOT))
    return root !== 0n && fg === root
  } catch {
    return false
  }
}

/** Convert exclusive fullscreen only. Windowed and borderless already let the overlay sit on the game. */
export function ensureGameOverlayFriendly(enabled: boolean): OverlayDisplayMode {
  try {
    const api = loadNative()
    const hwnd = findWindow()
    if (!hwndOk(hwnd) || api.IsIconic(hwnd)) {
      lastDisplayMode = 'unknown'
      lastBorderlessKey = ''
      return lastDisplayMode
    }
    const win = windowRect(hwnd)
    const monitor = monitorRect(hwnd)
    if (!win || !monitor) {
      lastDisplayMode = 'unknown'
      return lastDisplayMode
    }
    const style = styleBits(api.GetWindowLongPtrW(hwnd, GWL_STYLE))
    const exclusive = notificationState() === QUNS_RUNNING_D3D_FULL_SCREEN
    const covers = coversMonitor(win, monitor)
    const chrome = hasWindowChrome(style)
    lastDisplayMode = overlayDisplayMode({ exclusive, covers, chrome })
    if (
      !shouldApplyBorderless({
        enabled,
        exclusive,
        covers,
        chrome,
        window: win,
        monitor
      })
    ) {
      exclusiveApplyTries = 0
      lastExclusiveApplyAt = 0
      return lastDisplayMode
    }

    const key = `${hwndBits(hwnd)}:${monitor.x},${monitor.y},${monitor.width}x${monitor.height}:${borderlessStyle(style)}`
    const now = Date.now()
    if (key !== lastBorderlessKey) exclusiveApplyTries = 0
    if (
      exclusiveApplyTries < EXCLUSIVE_RETRY_LIMIT &&
      (key !== lastBorderlessKey || now - lastExclusiveApplyAt >= EXCLUSIVE_RETRY_MS)
    ) {
      lastBorderlessKey = key
      lastExclusiveApplyAt = now
      exclusiveApplyTries += 1
      applyBorderless(hwnd, monitor)
    }
    const after = windowRect(hwnd)
    const afterStyle = styleBits(api.GetWindowLongPtrW(hwnd, GWL_STYLE))
    lastDisplayMode = overlayDisplayMode({
      exclusive: notificationState() === QUNS_RUNNING_D3D_FULL_SCREEN,
      covers: after ? coversMonitor(after, monitor) : covers,
      chrome: hasWindowChrome(afterStyle)
    })
    return lastDisplayMode
  } catch {
    lastDisplayMode = 'unknown'
    return lastDisplayMode
  }
}

export function currentDisplayMode(): OverlayDisplayMode {
  return lastDisplayMode
}

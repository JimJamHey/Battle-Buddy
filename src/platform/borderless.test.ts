import { describe, expect, it } from 'vitest'
import {
  WS_CAPTION,
  WS_POPUP,
  WS_THICKFRAME,
  WS_VISIBLE,
  borderlessStyle,
  coversMonitor,
  hasWindowChrome,
  isD3dExclusive,
  overlayDisplayMode,
  shouldApplyBorderless
} from './borderless'

const monitor = { x: 0, y: 0, width: 2560, height: 1440 }

describe('borderless fullscreen helpers', () => {
  it('treats a nearly maximized window as covering the monitor', () => {
    expect(coversMonitor({ x: 0, y: 0, width: 2560, height: 1369 }, monitor)).toBe(true)
    expect(coversMonitor({ x: 80, y: 80, width: 1280, height: 720 }, monitor)).toBe(false)
  })

  it('strips caption chrome into a visible popup', () => {
    const next = borderlessStyle(WS_CAPTION | WS_THICKFRAME | WS_VISIBLE)
    expect(hasWindowChrome(WS_CAPTION | WS_THICKFRAME)).toBe(true)
    expect(hasWindowChrome(next)).toBe(false)
    expect(next & WS_POPUP).toBeTruthy()
    expect(next & WS_VISIBLE).toBeTruthy()
  })

  it('only rewrites exclusive fullscreen, never a normal window', () => {
    expect(
      shouldApplyBorderless({
        enabled: true,
        exclusive: true,
        covers: false,
        chrome: false,
        window: { x: 0, y: 0, width: 1280, height: 720 },
        monitor
      })
    ).toBe(true)
    expect(
      shouldApplyBorderless({
        enabled: true,
        exclusive: false,
        covers: true,
        chrome: true,
        window: { x: 0, y: 0, width: 2560, height: 1369 },
        monitor
      })
    ).toBe(false)
    expect(
      shouldApplyBorderless({
        enabled: true,
        exclusive: false,
        covers: true,
        chrome: false,
        window: monitor,
        monitor
      })
    ).toBe(false)
    expect(
      shouldApplyBorderless({
        enabled: false,
        exclusive: true,
        covers: true,
        chrome: false,
        window: monitor,
        monitor
      })
    ).toBe(false)
  })

  it('labels D3D exclusive separately from composited borderless', () => {
    expect(isD3dExclusive(3)).toBe(true)
    expect(isD3dExclusive(5)).toBe(false)
    expect(overlayDisplayMode({ exclusive: true, covers: true, chrome: false })).toBe('exclusive')
    expect(overlayDisplayMode({ exclusive: false, covers: true, chrome: false })).toBe('borderless')
    expect(overlayDisplayMode({ exclusive: false, covers: true, chrome: true })).toBe('windowed')
    expect(overlayDisplayMode({ exclusive: false, covers: false, chrome: true })).toBe('windowed')
  })
})

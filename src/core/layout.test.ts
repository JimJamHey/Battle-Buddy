import { describe, expect, it } from 'vitest'
import {
  clampLeftDockedPanel,
  clampOverlayPos,
  clampPoolWidth,
  clampRightDockedPanel,
  mergeOverlayLayout,
  migrateOverlayLayout,
  panelWidthStyle
} from './layout'
import { DEFAULT_OVERLAY_LAYOUT } from './types'

describe('overlay layout', () => {
  it('keeps other panels when only one is patched', () => {
    const moved = mergeOverlayLayout(DEFAULT_OVERLAY_LAYOUT, { rail: { x: 2, y: 10 } })
    expect(moved.rail).toEqual({ x: 2, y: 10, w: 20 })
    expect(moved.combat).toEqual(DEFAULT_OVERLAY_LAYOUT.combat)
    expect(moved.pool).toEqual(DEFAULT_OVERLAY_LAYOUT.pool)
  })

  it('docks session on the left and pool on the right', () => {
    const next = migrateOverlayLayout({
      ...DEFAULT_OVERLAY_LAYOUT,
      rail: { x: 40, y: 8, w: 22 },
      pool: { x: 10, y: 4, w: 24 }
    })
    expect(next.rail).toEqual({ x: 0, y: 8, w: 22 })
    expect(next.pool).toEqual({ x: 76, y: 4, w: 24 })
  })

  it('moves the old bottom pool onto the right edge', () => {
    const next = migrateOverlayLayout({
      ...DEFAULT_OVERLAY_LAYOUT,
      pool: { x: 16, y: 52, w: 20 }
    })
    expect(next.pool).toEqual({ x: 80, y: 52, w: 20 })
  })

  it('clamps panel positions onto the board', () => {
    expect(clampOverlayPos({ x: -4, y: 120 })).toEqual({ x: 0, y: 88 })
  })

  it('pins the pool to the right edge using its width', () => {
    expect(clampRightDockedPanel({ x: 90, y: 4, w: 20 })).toEqual({ x: 80, y: 4, w: 20 })
    expect(clampRightDockedPanel({ x: 82, y: 4, w: 18 })).toEqual({ x: 82, y: 4, w: 18 })
  })

  it('pins the session rail to the left edge', () => {
    expect(clampLeftDockedPanel({ x: 12, y: 6, w: 20 })).toEqual({ x: 0, y: 6, w: 20 })
  })

  it('shrinks legacy wide pool defaults', () => {
    const next = migrateOverlayLayout({
      ...DEFAULT_OVERLAY_LAYOUT,
      pool: { x: 71.5, y: 3.2, w: 26 }
    })
    expect(next.pool.w).toBe(20)
    expect(next.pool.x).toBe(80)
  })

  it('preserves user-chosen widths that are not the legacy default', () => {
    const next = migrateOverlayLayout({
      ...DEFAULT_OVERLAY_LAYOUT,
      pool: { x: 74, y: 3.2, w: 28 },
      rail: { x: 0.55, y: 5.5, w: 24 }
    })
    expect(next.pool).toEqual({ x: 72, y: 3.2, w: 28 })
    expect(next.rail).toEqual({ x: 0, y: 5.5, w: 24 })
  })

  it('clamps pool width into a usable range', () => {
    expect(clampPoolWidth(12)).toBe(12)
    expect(clampPoolWidth(44)).toBe(36)
  })

  it('uses vw for panel width so resize is visible', () => {
    expect(panelWidthStyle(20)).toBe('20vw')
    expect(panelWidthStyle(28)).toBe('28vw')
  })
})

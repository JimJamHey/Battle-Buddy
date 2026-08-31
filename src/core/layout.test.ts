import { describe, expect, it } from 'vitest'
import { clampOverlayPos, mergeOverlayLayout, migrateOverlayLayout } from './layout'
import { DEFAULT_OVERLAY_LAYOUT } from './types'

describe('overlay layout', () => {
  it('keeps other panels when only one is patched', () => {
    const moved = mergeOverlayLayout(DEFAULT_OVERLAY_LAYOUT, { rail: { x: 2, y: 10 } })
    expect(moved.rail).toEqual({ x: 2, y: 10 })
    expect(moved.combat).toEqual(DEFAULT_OVERLAY_LAYOUT.combat)
    expect(moved.pool).toEqual(DEFAULT_OVERLAY_LAYOUT.pool)
  })

  it('moves the old bottom pool onto the right-hand list', () => {
    const next = migrateOverlayLayout({
      ...DEFAULT_OVERLAY_LAYOUT,
      pool: { x: 16, y: 52 }
    })
    expect(next.pool).toEqual(DEFAULT_OVERLAY_LAYOUT.pool)
    expect(next.pool.x).toBeGreaterThan(70)
  })

  it('clamps panel positions onto the board', () => {
    expect(clampOverlayPos({ x: -4, y: 120 })).toEqual({ x: 0, y: 88 })
  })

  it('pulls a too-far-right pool back for the wider side panels', () => {
    const next = migrateOverlayLayout({
      ...DEFAULT_OVERLAY_LAYOUT,
      pool: { x: 74, y: 3.5 }
    })
    expect(next.pool.x).toBe(DEFAULT_OVERLAY_LAYOUT.pool.x)
  })
})

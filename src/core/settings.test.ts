import { describe, expect, it } from 'vitest'
import { sanitizeSettings, sanitizeTier } from './settings'
import { DEFAULT_SETTINGS } from './types'

describe('sanitizeSettings', () => {
  it('clamps opacity, layout, and region', () => {
    const next = sanitizeSettings(DEFAULT_SETTINGS, {
      overlayOpacity: 900,
      region: 'ZZ' as never,
      overlayLayout: { rail: { x: -20, y: 200 }, combat: { x: 10, y: 10 }, pool: { x: 80, y: 10 } },
      battleTag: '  TooLong'.repeat(20),
      showLobbyOnOverlay: true,
      currentMmr: 99_999
    })
    expect(next.overlayOpacity).toBe(100)
    expect(next.region).toBe('US')
    expect(next.overlayLayout.rail).toEqual({ x: 0, y: 88, w: 14 })
    expect(next.overlayLayout.pool).toEqual({ x: 86, y: 10, w: 14 })
    expect(next.battleTag.length).toBeLessThanOrEqual(64)
    expect(next.showLobbyOnOverlay).toBe(false)
    expect(next.currentMmr).toBe(30000)
    expect(next.theme).toBe('buddy')
    expect(next.showRatingCaptureRegions).toBe(true)
  })

  it('clamps custom rating capture boxes', () => {
    const next = sanitizeSettings(DEFAULT_SETTINGS, {
      showRatingCaptureRegions: false,
      ratingCapture: {
        play: { x: -10, y: 90, w: 4, h: 200 },
        results: { x: 40, y: 40, w: 20, h: 20 }
      }
    })
    expect(next.showRatingCaptureRegions).toBe(false)
    expect(next.ratingCapture.play.w).toBe(8)
    expect(next.ratingCapture.play.x).toBeGreaterThanOrEqual(0)
    expect(next.ratingCapture.results).toEqual({ x: 40, y: 40, w: 20, h: 20 })
  })

  it('keeps a valid launcher theme', () => {
    expect(sanitizeSettings(DEFAULT_SETTINGS, { theme: 'cthulhu' }).theme).toBe('cthulhu')
    expect(sanitizeSettings(DEFAULT_SETTINGS, { theme: 'ember' as never }).theme).toBe('classic')
    expect(sanitizeSettings(DEFAULT_SETTINGS, { theme: 'nope' as never }).theme).toBe('buddy')
  })

  it('clamps tavern peek', () => {
    expect(sanitizeTier(3)).toBe(3)
    expect(sanitizeTier(99)).toBe(7)
    expect(sanitizeTier(-2)).toBe(0)
    expect(sanitizeTier('nope')).toBe(0)
  })
})

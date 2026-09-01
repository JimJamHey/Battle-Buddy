import { describe, expect, it } from 'vitest'
import { opponentCombatCaptureRect } from './combatCapture'

describe('opponentCombatCaptureRect', () => {
  it('crops the upper combat board and stays above your minions', () => {
    const client = { x: 40, y: 20, width: 1920, height: 1080 }
    const region = opponentCombatCaptureRect(client)
    expect(region.x).toBe(40 + Math.round(1920 * 0.06))
    expect(region.y).toBe(20 + Math.round(1080 * 0.14))
    expect(region.width).toBe(Math.round(1920 * 0.88))
    expect(region.height).toBe(Math.round(1080 * 0.3))
    expect(region.y + region.height).toBeLessThan(20 + Math.round(1080 * 0.52))
    expect(region.x + region.width).toBeLessThanOrEqual(40 + 1920)
  })
})

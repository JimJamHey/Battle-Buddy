import { describe, expect, it } from 'vitest'
import { encodeBmp32, parsePlayRating, parseRatingObservation, acceptObservedRating, ratingCaptureRect, mergeRatingObservations, isSessionTotalDelta } from './playRating'

describe('parsePlayRating', () => {
  it('reads the Play-screen Rating label and ignores gold and other numbers', () => {
    expect(
      parsePlayRating(
        'Shop Welcome to the Battlegrounds! Rating 5205 Full Stats Season Rewards 32 Play'
      )
    ).toBe(5205)
    expect(parsePlayRating('Rating 5,205')).toBe(5205)
    expect(parsePlayRating('rating\n6271')).toBe(6271)
    expect(parsePlayRating('1645 gold  1:27 PM')).toBeNull()
    expect(parsePlayRating('')).toBeNull()
    expect(parsePlayRating('TestPlayer#1234')).toBeNull()
    expect(parsePlayRating('Shop TestPlayer#1234 Rating 5,216')).toBe(5216)
    expect(parseRatingObservation('Rating 5205 +44')).toEqual({ rating: 5205, delta: 44 })
    expect(parseRatingObservation('5271 +66')).toEqual({ rating: 5271, delta: 66 })
    expect(parseRatingObservation('Rating 5,073 Full Stats +44')).toEqual({ rating: 5073, delta: 44 })
    expect(parseRatingObservation('Rating 5073\n−18')).toEqual({ rating: 5073, delta: -18 })
    expect(
      parseRatingObservation('Al\'Akir LIVE Start 5,216 Now 5,073 Today -143 Avg place 5.3 Last 10')
    ).toEqual({ rating: null, delta: null })
    expect(parseRatingObservation('3rd Place! Rating 5204 +14')).toEqual({ rating: 5204, delta: 14 })
    expect(parseRatingObservation('Start 5,248 Current 5,248 Latest Games')).toEqual({
      rating: null,
      delta: null
    })
    expect(parseRatingObservation('Start 5,248 Current 5,248 4th Place! Rating 5190 +27')).toEqual({
      rating: 5190,
      delta: 27
    })
    expect(parseRatingObservation('1st Place!!! Rating 5248 + 101 + 168 + 10')).toEqual({
      rating: 5248,
      delta: 101
    })
    expect(parseRatingObservation('+ 168 + 10 Rating 5248 + 101')).toEqual({ rating: 5248, delta: 101 })
    expect(parseRatingObservation('+ 168 Rating 5248')).toEqual({ rating: 5248, delta: null })
    expect(parseRatingObservation('1st A. F. Kay -16 Now 5,147')).toEqual({ rating: null, delta: null })
    expect(
      mergeRatingObservations([
        { rating: 5073, delta: null },
        { rating: null, delta: -44 }
      ])
    ).toEqual({ rating: 5073, delta: -44 })
    expect(
      isSessionTotalDelta(-143, { startMmr: 5216, games: [{ mmrBefore: 5073 }] })
    ).toBe(true)
    expect(
      isSessionTotalDelta(73, { startMmr: 5216, games: [{ mmrBefore: 5073 }] })
    ).toBe(false)
    expect(parseRatingObservation('+71', { allowLoneDelta: true })).toEqual({ rating: null, delta: 71 })
    expect(parseRatingObservation('+3', { allowLoneDelta: true })).toEqual({ rating: null, delta: null })
    expect(acceptObservedRating(1234, { previous: 5216, battleTag: 'TestPlayer#1234' })).toBe(false)
    expect(acceptObservedRating(427, { previous: 5216, battleTag: 'TestPlayer#1234' })).toBe(false)
    expect(acceptObservedRating(5216, { previous: 427, battleTag: 'TestPlayer#1234' })).toBe(true)
    expect(acceptObservedRating(5260, { previous: 5216, battleTag: 'TestPlayer#1234' })).toBe(true)
    expect(acceptObservedRating(5412, { previous: 8210 })).toBe(false)
    expect(acceptObservedRating(5412, { previous: 8210, resync: true })).toBe(true)
    expect(acceptObservedRating(1234, { previous: 8210, resync: true, battleTag: 'TestPlayer#1234' })).toBe(false)
  })
})

describe('ratingCaptureRect', () => {
  it('crops the center-right of the client where Rating is drawn', () => {
    const region = ratingCaptureRect({ x: 100, y: 40, width: 1920, height: 1080 })
    expect(region.x).toBe(100 + Math.round(1920 * 0.42))
    expect(region.width).toBeGreaterThan(300)
    expect(region.x + region.width).toBeLessThanOrEqual(100 + 1920)
  })
})

describe('encodeBmp32', () => {
  it('writes a bottom-up 32-bit BMP header', () => {
    const pixels = Buffer.alloc(8)
    pixels.writeUInt32LE(0x00ff00ff, 0)
    pixels.writeUInt32LE(0x0000ff00, 4)
    const bmp = encodeBmp32(1, 2, pixels)
    expect(bmp.toString('ascii', 0, 2)).toBe('BM')
    expect(bmp.readUInt32LE(10)).toBe(54)
    expect(bmp.readInt32LE(18)).toBe(1)
    expect(bmp.readInt32LE(22)).toBe(2)
    expect(bmp.readUInt16LE(28)).toBe(32)
  })
})

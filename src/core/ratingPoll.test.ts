import { describe, expect, it } from 'vitest'
import { ratingPollIntervalMs, ratingPollMode, shouldPollRating } from './ratingPoll'

describe('ratingPoll', () => {
  const base = {
    hsFound: true,
    logCatchup: false,
    gameActive: false,
    scene: 'bacon' as const,
    awaitingPostGameMmr: false,
    placement: null,
    playedAsSelf: true,
    lastGameSettled: true,
    hasLastGame: false
  }

  it('polls on the bacon menu while idle', () => {
    expect(shouldPollRating(base)).toBe(true)
    expect(ratingPollMode({ awaitingPostGameMmr: false, lastGameSettled: true, hasLastGame: false })).toBe(
      'idle'
    )
    expect(ratingPollIntervalMs('idle')).toBe(8000)
  })

  it('skips mid-match shop screens', () => {
    expect(shouldPollRating({ ...base, gameActive: true })).toBe(false)
  })

  it('polls during results once placement is known', () => {
    expect(
      shouldPollRating({
        ...base,
        gameActive: true,
        scene: 'gameplay',
        placement: 3,
        awaitingPostGameMmr: true
      })
    ).toBe(true)
    expect(ratingPollMode({ awaitingPostGameMmr: true, lastGameSettled: false, hasLastGame: true })).toBe(
      'postgame'
    )
  })

  it('keeps polling unsettled games after the initial post-game burst', () => {
    expect(
      shouldPollRating({
        ...base,
        scene: 'hub',
        hasLastGame: true,
        lastGameSettled: false
      })
    ).toBe(true)
  })

  it('polls the Play screen before logs have a bacon scene', () => {
    expect(shouldPollRating({ ...base, scene: 'unknown' })).toBe(true)
    expect(shouldPollRating({ ...base, scene: 'hub' })).toBe(false)
  })

  it('does not poll without Hearthstone or during log catchup', () => {
    expect(shouldPollRating({ ...base, hsFound: false })).toBe(false)
    expect(shouldPollRating({ ...base, logCatchup: true })).toBe(false)
  })
})

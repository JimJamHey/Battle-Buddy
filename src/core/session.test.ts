import { describe, expect, it } from 'vitest'
import {
  applyGameMmr,
  applyRatingObservation,
  bindCurrentMmr,
  recordFinish,
  emptySession,
  ensureToday,
  averageFinish,
  dedupeGames,
  gameMmrIsSettled
} from './session'

describe('session', () => {
  it('averages today’s finishes and keeps a rolling last 10', () => {
    const day = new Date('2026-08-25T12:00:00')
    let s = emptySession(day)
    s = recordFinish(s, { endedAt: '2026-08-25T12:00:00', placement: 1, turn: 10 }, day)
    s = recordFinish(s, { endedAt: '2026-08-25T13:00:00', placement: 4, turn: 8 }, day)
    expect(averageFinish(s, day)).toBe(2.5)
    for (let i = 0; i < 10; i++) {
      s = recordFinish(s, { endedAt: `2026-08-25T14:0${i}:00`, placement: 8, turn: 4 }, day)
    }
    expect(s.games).toHaveLength(10)
    expect(s.games[0]?.placement).toBe(8)
  })

  it('starts a fresh session at midnight', () => {
    const monday = new Date('2026-08-25T22:00:00')
    const tuesday = new Date('2026-08-26T08:00:00')
    let s = recordFinish(
      emptySession(monday),
      { endedAt: '2026-08-25T22:00:00', placement: 2, turn: 12, mmrBefore: 5200 },
      monday
    )
    s = { ...s, startMmr: 5200 }
    s = ensureToday(s, tuesday)
    expect(s.date).toBe('2026-08-26')
    expect(s.games).toEqual([])
    expect(s.startMmr).toBeNull()
    expect(averageFinish(s, tuesday)).toBeNull()
  })

  it('fills MMR delta once the Play-screen rating moves', () => {
    const day = new Date('2026-08-25T12:00:00')
    let s = recordFinish(
      emptySession(day),
      { endedAt: '2026-08-25T12:00:00', placement: 2, turn: 12, mmrBefore: 5200 },
      day
    )
    expect(applyGameMmr(s, 5200)).toBe(s)
    s = applyGameMmr(s, 5244)
    expect(s.games[0]?.mmrDelta).toBe(44)
    expect(s.games[0]?.mmrAfter).toBe(5244)
    expect(s.games[0]?.mmrEstimated).toBe(false)
    s = applyRatingObservation(
      recordFinish(emptySession(day), { endedAt: '2026-08-25T12:00:00', placement: 4, turn: 10, mmrBefore: 5200 }, day),
      { rating: 5200, delta: null },
      { settled: true }
    )
    expect(s.games[0]?.mmrAfter).toBe(5200)
    expect(s.games[0]?.mmrDelta).toBe(0)
    s = applyRatingObservation(
      recordFinish(emptySession(day), { endedAt: '2026-08-25T12:00:00', placement: 2, turn: 12, mmrBefore: 5200 }, day),
      { rating: null, delta: 44 }
    )
    expect(s.games[0]?.mmrAfter).toBe(5244)
    expect(s.games[0]?.mmrDelta).toBe(44)
  })

  it('does not copy the session Today total onto the last game', () => {
    const day = new Date('2026-08-26T22:00:00')
    let s = recordFinish(
      { date: '2026-08-26', games: [], startMmr: 5216 },
      { endedAt: '2026-08-26T22:16:27.654Z', placement: 2, turn: 15, heroName: "Al'Akir", mmrBefore: 5073 },
      day
    )
    s = applyRatingObservation(s, { rating: null, delta: -143 })
    expect(s.games[0]?.mmrDelta).toBeNull()
    s = applyRatingObservation(
      { ...s, games: [{ ...s.games[0], mmrAfter: 4930, mmrDelta: -143 }] },
      { rating: 5146, delta: 73 }
    )
    expect(s.games[0]?.mmrAfter).toBe(5146)
    expect(s.games[0]?.mmrDelta).toBe(73)
  })

  it('replaces a junk last-game delta with the results-screen Rating pair', () => {
    const day = new Date('2026-08-26T22:00:00')
    let s = recordFinish(
      { date: '2026-08-26', games: [], startMmr: 5216 },
      { endedAt: '2026-08-26T22:57:47.072Z', placement: 1, turn: 17, heroName: 'A. F. Kay', mmrBefore: 5147 },
      day
    )
    s = applyRatingObservation(s, { rating: null, delta: -36 })
    expect(s.games[0]?.mmrDelta).toBeNull()
    s = applyRatingObservation(s, { rating: 5111, delta: -36 })
    expect(s.games[0]?.mmrAfter).toBeNull()
    s = {
      ...s,
      games: [{ ...s.games[0], mmrAfter: 5111, mmrDelta: -36 }]
    }
    expect(gameMmrIsSettled(s.games[0])).toBe(false)
    s = applyRatingObservation(s, { rating: 5248, delta: 101 })
    expect(s.games[0]?.mmrAfter).toBe(5248)
    expect(s.games[0]?.mmrDelta).toBe(101)
    expect(gameMmrIsSettled(s.games[0])).toBe(true)
  })

  it('trusts a results-screen Rating pair even when start MMR was stale', () => {
    const day = new Date('2026-08-31T15:41:00')
    let s = recordFinish(
      { date: '2026-08-31', games: [], startMmr: 5248 },
      { endedAt: '2026-08-31T15:41:00.000Z', placement: 1, turn: 12, heroName: 'Vanessa VanCleef', mmrBefore: 5248 },
      day
    )
    s = applyRatingObservation(s, { rating: 5601, delta: 101 })
    expect(s.games[0]?.mmrBefore).toBe(5500)
    expect(s.games[0]?.mmrAfter).toBe(5601)
    expect(s.games[0]?.mmrDelta).toBe(101)
    expect(gameMmrIsSettled(s.games[0])).toBe(true)
  })

  it('does not invent MMR from placement, and collapses restart duplicates', () => {
    const day = new Date('2026-08-26T12:00:00')
    let s = recordFinish(
      emptySession(day),
      { endedAt: '2026-08-26T17:09:32.172Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrEstimated: true, mmrDelta: 71 },
      day
    )
    expect(s.games[0]?.mmrDelta).toBeNull()
    s = recordFinish(
      s,
      { endedAt: '2026-08-26T17:20:54.627Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrEstimated: true, mmrDelta: 71 },
      day
    )
    expect(s.games).toHaveLength(1)
    s = bindCurrentMmr(s, 5205, day)
    expect(s.games[0]?.mmrAfter).toBe(5205)
    expect(s.games[0]?.mmrDelta).toBeNull()
    expect(s.startMmr).toBe(5205)
    expect(
      dedupeGames([
        { endedAt: '2026-08-26T17:09:32.172Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrDelta: 71, mmrEstimated: true },
        { endedAt: '2026-08-26T17:20:54.627Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrDelta: 71, mmrEstimated: true }
      ])
    ).toHaveLength(1)
  })
})

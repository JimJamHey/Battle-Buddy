import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, DEFAULT_UPDATE } from '../core/types'
import { formatDamageRange, formatDelta, formatMmr, formatPct, lobbyRatingLabel, combatOpponentLabel, ordinal, placeClass, ratingLabel, selfRating, shouldShowUpdate } from './format'

describe('format helpers', () => {
  it('formats mmr and deltas', () => {
    expect(formatMmr(5052)).toBe('5,052')
    expect(formatMmr(null)).toBe('—')
    expect(formatDelta(-14)).toBe('-14')
    expect(formatDelta(22)).toBe('+22')
    expect(formatDelta(22, true)).toBe('~+22')
    expect(formatPct(10.9)).toBe('10.9')
    expect(formatPct(75)).toBe('75')
    expect(formatDamageRange(6, 11)).toBe('6–11')
    expect(formatDamageRange(4, 4)).toBe('4')
  })

  it('labels places', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(6)).toBe('6th')
    expect(placeClass(1)).toBe('place-1')
    expect(placeClass(4)).toBe('place-good')
    expect(placeClass(6)).toBe('place-bad')
  })

  it('uses public MMR and never fabricates 8000', () => {
    expect(
      ratingLabel({
        selfPublicMmr: 5053,
        lobbyMmr: [
          {
            playerId: 1,
            name: 'TestPlayer',
            isSelf: true,
            rating: null,
            rank: null,
            unknownName: false,
            belowCutoff: true
          }
        ],
        session: { date: '2026-08-25', games: [], startMmr: 5052 }
      })
    ).toBe('5,053')
    expect(
      lobbyRatingLabel({
        playerId: 2,
        name: 'MagicPants',
        isSelf: false,
        rating: null,
        rank: null,
        unknownName: false,
        belowCutoff: true
      })
    ).toBe('Unlisted')
    expect(
      selfRating({
        selfPublicMmr: null,
        lobbyMmr: [],
        session: { date: '2026-08-25', games: [], startMmr: null }
      })
    ).toBeNull()
    expect(
      selfRating({
        selfPublicMmr: null,
        lobbyMmr: [],
        session: { date: '2026-08-26', games: [], startMmr: null },
        settings: { ...DEFAULT_SETTINGS, currentMmr: 5216 }
      })
    ).toBe(5216)
    expect(
      selfRating({
        selfPublicMmr: null,
        lobbyMmr: [],
        session: {
          date: '2026-08-26',
          games: [
            {
              endedAt: '2026-08-26T12:00:00.000Z',
              placement: 8,
              turn: 9,
              mmrBefore: 5248,
              mmrAfter: 5163,
              mmrDelta: -85
            }
          ],
          startMmr: 5248
        },
        settings: { ...DEFAULT_SETTINGS, currentMmr: 5248 }
      })
    ).toBe(5248)
    expect(
      selfRating({
        selfPublicMmr: null,
        lobbyMmr: [],
        session: {
          date: '2026-08-26',
          games: [
            {
              endedAt: '2026-08-26T12:00:00.000Z',
              placement: 8,
              turn: 9,
              mmrBefore: 5248,
              mmrAfter: 5163,
              mmrDelta: -85
            }
          ],
          startMmr: 5248
        },
        settings: { ...DEFAULT_SETTINGS, currentMmr: null }
      })
    ).toBe(5163)
    expect(
      selfRating({
        selfPublicMmr: 8210,
        lobbyMmr: [],
        session: { date: '2026-08-30', games: [], startMmr: 8210 },
        settings: { ...DEFAULT_SETTINGS, currentMmr: 5412 }
      })
    ).toBe(5412)
    expect(
      selfRating({
        selfPublicMmr: 8210,
        lobbyMmr: [],
        session: {
          date: '2026-08-30',
          games: [
            {
              endedAt: '2026-08-30T12:00:00.000Z',
              placement: 4,
              turn: 10,
              mmrBefore: 8210,
              mmrAfter: 8210,
              mmrDelta: 0
            }
          ],
          startMmr: 8210
        },
        settings: { ...DEFAULT_SETTINGS, currentMmr: 5412 }
      })
    ).toBe(5412)
  })

  it('prefers the lobby BattleTag over a hero combat label', () => {
    expect(
      combatOpponentLabel(
        { opponentName: 'Lady Vashj', opponentPlayerId: 8 },
        [
          {
            playerId: 8,
            name: 'Lipman',
            isSelf: false,
            rating: null,
            rank: null,
            unknownName: false,
            belowCutoff: true,
            heroName: 'Lady Vashj'
          }
        ]
      )
    ).toBe('Lipman')
    expect(
      combatOpponentLabel(
        { opponentName: 'Cagey', opponentPlayerId: 3 },
        [
          {
            playerId: 3,
            name: 'Player 3',
            isSelf: false,
            rating: null,
            rank: null,
            unknownName: true,
            belowCutoff: true
          }
        ]
      )
    ).toBe('Cagey')
  })

  it('shows the update banner for actionable phases', () => {
    expect(shouldShowUpdate({ ...DEFAULT_UPDATE, phase: 'idle' })).toBe(false)
    expect(shouldShowUpdate({ ...DEFAULT_UPDATE, phase: 'available', availableVersion: '0.2.0' })).toBe(true)
    expect(shouldShowUpdate({ ...DEFAULT_UPDATE, phase: 'available', dismissed: true })).toBe(false)
    expect(shouldShowUpdate({ ...DEFAULT_UPDATE, phase: 'ready', dismissed: true })).toBe(true)
  })
})

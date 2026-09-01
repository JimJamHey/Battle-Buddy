import { describe, expect, it } from 'vitest'
import { catalogForSeen, isGainedKeyword, liveTone, pickLastSeenBoard, printedStats } from './liveStats'
import type { SeenBoard } from './types'

const board = (playerId: number, name: string): SeenBoard => ({
  playerId,
  name,
  turn: 4,
  minions: [{ cardId: 'BG_PET', name: 'Pet', attack: 2, health: 2 }],
  hand: [{ cardId: 'BG_HAND', name: 'Held', attack: 6, health: 8, taunt: true }]
})

describe('liveStats', () => {
  it('picks the combat opponent board, otherwise the last remembered one', () => {
    const boards = [board(3, 'Ada'), board(8, 'Beau')]
    expect(pickLastSeenBoard(boards, 3)?.name).toBe('Ada')
    expect(pickLastSeenBoard(boards, 9)?.name).toBe('Beau')
    expect(pickLastSeenBoard(boards, null)?.name).toBe('Beau')
    expect(pickLastSeenBoard([], null)).toBeNull()
  })

  it('treats golden printed stats as double the catalog body', () => {
    expect(printedStats({ attack: 4, health: 5 }, false)).toEqual({ attack: 4, health: 5 })
    expect(printedStats({ attack: 4, health: 5 }, true)).toEqual({ attack: 8, health: 10 })
    expect(printedStats(undefined, true)).toBeNull()
  })

  it('marks live gems green when buffed and red when damaged', () => {
    expect(liveTone(9, 4, 'atk')).toBe('boosted')
    expect(liveTone(4, 4, 'atk')).toBeNull()
    expect(liveTone(3, 4, 'atk')).toBeNull()
    expect(liveTone(2, 5, 'hp')).toBe('damaged')
    expect(liveTone(5, undefined, 'hp')).toBeNull()
  })

  it('resolves golden card ids back to the catalog body', () => {
    const catalog = [
      {
        id: 'BG_PET',
        dbfId: 1,
        name: 'Pet',
        text: '',
        attack: 4,
        health: 5,
        techLevel: 1,
        tribes: [],
        tileUrl: '',
        goldenId: 'BG_PET_G',
        kind: 'minion' as const,
        cost: 1
      }
    ]
    expect(catalogForSeen({ cardId: 'BG_PET_G', name: '', attack: 8, health: 10, golden: true }, catalog)?.id).toBe(
      'BG_PET'
    )
  })

  it('only flags keywords that are not already printed on the card', () => {
    expect(isGainedKeyword(true, { mechanics: ['Taunt'] }, 'Taunt')).toBe(false)
    expect(isGainedKeyword(true, { mechanics: ['Deathrattle'] }, 'Taunt')).toBe(true)
    expect(isGainedKeyword(true, undefined, 'Taunt')).toBe(true)
    expect(isGainedKeyword(false, undefined, 'Taunt')).toBe(false)
  })
})

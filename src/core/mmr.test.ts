import { describe, expect, it } from 'vitest'
import { matchLobby, indexLeaderboard } from './mmr'

describe('mmr', () => {
  it('matches lobby names to the public board and flags the cutoff', () => {
    const board = indexLeaderboard([
      { accountid: 'Prophane', rating: 11240, rank: 389 },
      { accountid: 'Jaren', rating: 9001, rank: 1200 }
    ])
    const rows = matchLobby(
      [
        { playerId: 1, rawName: 'Jaren#1234' },
        { playerId: 2, rawName: 'Prophane#9' },
        { playerId: 3, rawName: 'CasualJoe' }
      ],
      board,
      'Jaren'
    )
    const prop = rows.find((r) => r.name === 'Prophane')
    const joe = rows.find((r) => r.name === 'CasualJoe')
    const me = rows.find((r) => r.isSelf)
    expect(prop?.rating).toBe(11240)
    expect(joe?.belowCutoff).toBe(true)
    expect(joe?.rating).toBeNull()
    expect(me?.name).toBe('Jaren')
  })

  it('does not inject the local BattleTag into a spectated lobby', () => {
    const rows = matchLobby(
      [{ playerId: 1, rawName: 'Munky#11189', heroName: 'Loh' }],
      indexLeaderboard([]),
      'JimJamHey',
      { spectating: true, watchedPlayerId: 1 }
    )
    expect(rows.some((row) => row.name === 'JimJamHey')).toBe(false)
    expect(rows.find((row) => row.isSelf)?.name).toBe('Munky')
  })

  it('labels unnamed lobby seats as Player N instead of the hero', () => {
    const rows = matchLobby(
      [{ playerId: 3, rawName: 'Player 3', heroName: 'Lady Vashj', heroCardId: 'BG23_HERO_201' }],
      indexLeaderboard([]),
      'JimJamHey'
    )
    expect(rows.find((row) => row.playerId === 3)?.name).toBe('Player 3')
    expect(rows.find((row) => row.playerId === 3)?.heroName).toBe('Lady Vashj')
  })
})

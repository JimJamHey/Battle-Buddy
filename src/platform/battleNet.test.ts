import { describe, expect, it } from 'vitest'
import { mapBattleNetRegion } from './battleNet'

describe('region map', () => {
  it('maps Battle.net regions onto leaderboard regions', () => {
    expect(mapBattleNetRegion('EU')).toBe('EU')
    expect(mapBattleNetRegion('kr')).toBe('AP')
    expect(mapBattleNetRegion('US')).toBe('US')
  })
})

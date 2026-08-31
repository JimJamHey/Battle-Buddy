import { describe, expect, it } from 'vitest'
import { selectSessionLogDir } from './logPaths'

describe('log paths', () => {
  it('picks the newest Hearthstone session folder even before Power.log exists', () => {
    expect(
      selectSessionLogDir([
        { name: 'Hearthstone_2026_08_24_10_00_00', mtimeMs: 10 },
        { name: 'Hearthstone_2026_08_25_11_40_57', mtimeMs: 25 },
        { name: 'other', mtimeMs: 99 }
      ])
    ).toBe('Hearthstone_2026_08_25_11_40_57')
  })
})

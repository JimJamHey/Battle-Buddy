import { describe, expect, it } from 'vitest'
import { readCombatHandsFromText } from '../main/combatOcr'

describe('combatOcr', () => {
  const catalog = [
    { id: 'A', name: 'Diremuck Forager', attack: 4, health: 5, tribes: ['Murloc'] },
    { id: 'B', name: 'Murloc', attack: 2, health: 1, tribes: ['Murloc'] }
  ]

  it('reads friendly and opponent hands from separate OCR blobs', () => {
    const result = readCombatHandsFromText(
      'Diremuck Forager 18 16',
      'Murloc 7 4',
      catalog
    )
    expect(result.friendly).toHaveLength(1)
    expect(result.friendly[0]).toMatchObject({ cardId: 'A', attack: 18, health: 16 })
    expect(result.opponent).toHaveLength(1)
    expect(result.opponent[0]).toMatchObject({ cardId: 'B', attack: 7, health: 4 })
    expect(result.statsUncertain).toEqual({ friendly: false, opponent: false })
  })

  it('reports uncertain stats when printed values are missing', () => {
    const result = readCombatHandsFromText('Diremuck Forager', '', catalog)
    expect(result.statsUncertain.friendly).toBe(true)
    expect(result.friendly[0]).toMatchObject({ attack: 4, health: 5 })
  })
})

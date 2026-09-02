import { describe, expect, it } from 'vitest'
import { friendlyHandCaptureRect } from './combatCapture'
import { combatInputNeedsHandOcr, matchCatalogCardsFromText } from './combatHand'
import type { CombatInput } from './combatSim'

describe('combatHand', () => {
  it('matches catalog card names from OCR text', () => {
    const catalog = [
      { id: 'A', name: 'Diremuck Forager', attack: 4, health: 5, tribes: ['Murloc'] },
      { id: 'B', name: 'Murloc', attack: 2, health: 1, tribes: ['Murloc'] }
    ]
    const hits = matchCatalogCardsFromText('Diremuck Forager ready', catalog)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.cardId).toBe('A')
  })

  it('does not match short names inside longer card names', () => {
    const catalog = [
      { id: 'A', name: 'Diremuck Forager', attack: 4, health: 5, tribes: ['Murloc'] },
      { id: 'B', name: 'Murloc', attack: 2, health: 1, tribes: ['Murloc'] }
    ]
    expect(matchCatalogCardsFromText('Diremuck Forager ready', catalog)).toHaveLength(1)
    expect(matchCatalogCardsFromText('Diremuck Forager ready', catalog)[0]?.cardId).toBe('A')
    expect(matchCatalogCardsFromText('random murloc swarm', catalog)).toHaveLength(1)
    expect(matchCatalogCardsFromText('random murloc swarm', catalog)[0]?.cardId).toBe('B')
  })

  it('flags sides that summon from hand without a logged hand', () => {
    const input: CombatInput = {
      friendly: {
        playerId: 1,
        name: 'Me',
        heroHealth: 30,
        heroArmor: 0,
        minions: [
          {
            cardId: 'BG27_556',
            name: 'Diremuck Forager',
            attack: 4,
            health: 5,
            divineShield: false,
            taunt: false,
            poisonous: false,
            venomous: false,
            reborn: false,
            windfury: false,
            megaWindfury: false,
            deathrattle: false,
            kit: {
              triggers: [
                {
                  when: 'startOfCombat',
                  effects: [{ op: 'summonFromHand', tribe: 'Murloc', select: 'highestAttack' }]
                }
              ],
              extraDeathrattles: 0,
              cleave: false
            }
          }
        ]
      },
      opponent: {
        playerId: 2,
        name: 'Them',
        heroHealth: 30,
        heroArmor: 0,
        minions: [
          {
            cardId: 'X',
            name: 'Dummy',
            attack: 1,
            health: 1,
            divineShield: false,
            taunt: false,
            poisonous: false,
            venomous: false,
            reborn: false,
            windfury: false,
            megaWindfury: false,
            deathrattle: false
          }
        ]
      }
    }
    const needs = combatInputNeedsHandOcr(input, [
      {
        id: 'BG27_556',
        name: 'Diremuck Forager',
        text: 'Start of Combat: summon the highest-Attack Murloc from your hand.'
      }
    ])
    expect(needs.friendly).toBe(true)
    expect(needs.opponent).toBe(false)
  })
})

describe('friendlyHandCaptureRect', () => {
  it('targets the bottom hand strip', () => {
    const client = { x: 0, y: 0, width: 1920, height: 1080 }
    const region = friendlyHandCaptureRect(client)
    expect(region.y).toBeGreaterThan(700)
    expect(region.width).toBeGreaterThan(1000)
  })
})

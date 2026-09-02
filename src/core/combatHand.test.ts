import { describe, expect, it } from 'vitest'
import { friendlyHandCaptureRect, opponentHandCaptureRect } from './combatCapture'
import {
  combatInputNeedsHandOcr,
  combatInputNeedsHandStatOcr,
  matchCatalogCardsFromText,
  parseStatsNearCardName
} from './combatHand'
import type { CombatInput } from './combatSim'

describe('combatHand', () => {
  const catalog = [
    { id: 'A', name: 'Diremuck Forager', attack: 4, health: 5, tribes: ['Murloc'] },
    { id: 'B', name: 'Murloc', attack: 2, health: 1, tribes: ['Murloc'] }
  ]

  it('matches catalog card names from OCR text', () => {
    const hits = matchCatalogCardsFromText('Diremuck Forager ready', catalog)
    expect(hits.minions).toHaveLength(1)
    expect(hits.minions[0]?.cardId).toBe('A')
  })

  it('does not match short names inside longer card names', () => {
    expect(matchCatalogCardsFromText('Diremuck Forager ready', catalog).minions).toHaveLength(1)
    expect(matchCatalogCardsFromText('Diremuck Forager ready', catalog).minions[0]?.cardId).toBe('A')
    expect(matchCatalogCardsFromText('random murloc swarm', catalog).minions).toHaveLength(1)
    expect(matchCatalogCardsFromText('random murloc swarm', catalog).minions[0]?.cardId).toBe('B')
  })

  it('reads buffed attack and health near the card name', () => {
    expect(parseStatsNearCardName('Diremuck Forager 15 12', 'Diremuck Forager')).toEqual({
      attack: 15,
      health: 12
    })
    expect(parseStatsNearCardName('15/12 Diremuck Forager', 'Diremuck Forager')).toEqual({
      attack: 15,
      health: 12
    })
    const read = matchCatalogCardsFromText('Diremuck Forager 20 18 combat', catalog)
    expect(read.minions[0]).toMatchObject({ attack: 20, health: 18, statsFromOcr: true })
    expect(read.statsUncertain).toBe(false)
  })

  it('marks stats uncertain when OCR lacks printed stats', () => {
    const read = matchCatalogCardsFromText('Diremuck Forager ready', catalog)
    expect(read.minions[0]).toMatchObject({ attack: 4, health: 5, statsFromOcr: false })
    expect(read.statsUncertain).toBe(true)
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
    const statNeeds = combatInputNeedsHandStatOcr(input, [
      {
        id: 'BG27_556',
        name: 'Diremuck Forager',
        text: 'Start of Combat: summon the highest-Attack Murloc from your hand.'
      }
    ])
    expect(statNeeds.friendly).toBe(true)
    expect(statNeeds.opponent).toBe(false)
  })

  it('flags opponent hand OCR when their board summons from hand', () => {
    const input: CombatInput = {
      friendly: {
        playerId: 1,
        name: 'Me',
        heroHealth: 30,
        heroArmor: 0,
        minions: [{ cardId: 'X', name: 'Dummy', attack: 1, health: 1, divineShield: false, taunt: false, poisonous: false, venomous: false, reborn: false, windfury: false, megaWindfury: false, deathrattle: false }]
      },
      opponent: {
        playerId: 2,
        name: 'Them',
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
      }
    }
    const needs = combatInputNeedsHandOcr(input, [
      {
        id: 'BG27_556',
        name: 'Diremuck Forager',
        text: 'Start of Combat: summon the highest-Attack Murloc from your hand.'
      }
    ])
    expect(needs.opponent).toBe(true)
    expect(needs.friendly).toBe(false)
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

describe('opponentHandCaptureRect', () => {
  it('targets the top hand strip above the opponent board', () => {
    const client = { x: 0, y: 0, width: 1920, height: 1080 }
    const region = opponentHandCaptureRect(client)
    expect(region.y).toBeLessThan(250)
    expect(region.width).toBeGreaterThan(1000)
    expect(region.y + region.height).toBeLessThan(friendlyHandCaptureRect(client).y)
  })
})

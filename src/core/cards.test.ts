import { describe, expect, it } from 'vitest'
import {
  catalogFromCardsJson,
  cardTileUrls,
  cardSlug,
  cardGoldenRenderUrls,
  boardCardUrls,
  baseCardId,
  heroBuddyCardId,
  heroHasBuddy,
  type RawCard
} from './cards'

describe('cards', () => {
  it('keeps bacon pool minions and drops goldens and heroes', () => {
    const cards: RawCard[] = [
      {
        id: 'BG_A',
        dbfId: 1,
        name: 'Sellemental',
        type: 'MINION',
        techLevel: 2,
        attack: 2,
        health: 2,
        battlegroundsPremiumDbfId: 2,
        isBattlegroundsPoolMinion: true,
        mechanics: ['TAUNT'],
        text: '<b>Taunt</b>. Rally: go.'
      },
      {
        id: 'BG_A_G',
        dbfId: 2,
        name: 'Sellemental',
        type: 'MINION',
        techLevel: 2,
        battlegroundsNormalDbfId: 1
      },
      {
        id: 'BG_H',
        dbfId: 3,
        name: 'A hero',
        type: 'HERO',
        techLevel: 1,
        battlegrounds: { hero: true, tier: 1 }
      }
    ]
    const catalog = catalogFromCardsJson(cards)
    expect(catalog).toHaveLength(1)
    expect(catalog[0].name).toBe('Sellemental')
    expect(catalog[0].techLevel).toBe(2)
    expect(catalog[0].goldenId).toBe('BG_A_G')
    expect(catalog[0].tribes).toEqual([])
    expect(catalog[0].mechanics).toEqual(['Taunt', 'Rally'])
    expect(cardTileUrls('BG30_122')[0]).toContain('/tiles/BG30_122.png')
    expect(baseCardId('TB_BaconShop_HERO_53_SKIN_D')).toBe('TB_BaconShop_HERO_53')
  })

  it('resolves golden art by premium id and by card name', () => {
    expect(cardSlug('Deadly Spore')).toBe('deadly-spore')
    expect(cardSlug("Nomi, Kitchen Nightmare")).toBe('nomi-kitchen-nightmare')
    const urls = cardGoldenRenderUrls('BGS_131_G', 'Deadly Spore', 'BGS_131', 65031)
    expect(urls[0]).toContain('/bgs/latest/enUS/512x/BGS_131_G.png')
    expect(urls.some((url) => url.includes('hsbg.cards'))).toBe(true)
    expect(urls.some((url) => url.includes('golden=true'))).toBe(true)
    expect(urls.every((url) => !url.includes('/render/latest/'))).toBe(true)
    expect(urls.every((url) => !url.endsWith('.jpg'))).toBe(true)
  })

  it('uses transparent tavern frames for golden hover cards', () => {
    const urls = boardCardUrls('BG33_140_G', 'Forest Rover', 110911, true)
    expect(urls.some((url) => url.includes('/bgs/latest/enUS/512x/BG33_140_G.png'))).toBe(true)
    expect(urls.some((url) => url.includes('hsbg.cards'))).toBe(true)
    expect(urls.every((url) => !url.includes('/render/latest/'))).toBe(true)
  })

  it('normalizes HSJSON race enums onto overlay tribe names', () => {
    const catalog = catalogFromCardsJson([
      {
        id: 'BG_BEAST',
        dbfId: 10,
        name: 'Bear',
        type: 'MINION',
        techLevel: 1,
        race: 'BEAST',
        races: ['BEAST'],
        isBattlegroundsPoolMinion: true
      },
      {
        id: 'BG_MECH',
        dbfId: 11,
        name: 'Bot',
        type: 'MINION',
        techLevel: 1,
        race: 'MECHANICAL',
        races: ['MECHANICAL'],
        isBattlegroundsPoolMinion: true
      }
    ])
    expect(catalog.find((card) => card.id === 'BG_BEAST')?.tribes).toEqual(['Beast'])
    expect(catalog.find((card) => card.id === 'BG_MECH')?.tribes).toEqual(['Mech'])
  })

  it('keeps battlegrounds tavern spells in the pool', () => {
    const catalog = catalogFromCardsJson([
      {
        id: 'BG28_600',
        dbfId: 9,
        name: 'Tavern Coin',
        type: 'SPELL',
        techLevel: 1,
        cost: 1,
        isBattlegroundsPoolSpell: true
      },
      {
        id: 'BG28_168',
        dbfId: 10,
        name: 'Shiny Ring',
        type: 'BATTLEGROUND_SPELL',
        techLevel: 3,
        cost: 2,
        isBattlegroundsPoolSpell: true,
        mechanics: ['CHOOSE_ONE'],
        text: '<b>Choose One</b> - Give a minion +1/+1; or <b>Taunt</b>.'
      }
    ])
    expect(catalog.map((card) => card.kind)).toEqual(['spell', 'spell'])
    expect(catalog.every((card) => card.goldenId === null)).toBe(true)
    expect(catalog.find((card) => card.id === 'BG28_168')?.mechanics).toEqual(['Taunt', 'Choose One'])
  })

  it('keeps hero buddies and drops golden buddy copies', () => {
    const catalog = catalogFromCardsJson([
      {
        id: 'BG20_HERO_101_Buddy',
        dbfId: 20,
        name: 'Baby Elekk',
        type: 'MINION',
        techLevel: 3,
        isBattlegroundsBuddy: true,
        mechanics: ['BATTLECRY'],
        text: '<b>Battlecry:</b> Activate (1): Get a Lockbox.'
      },
      {
        id: 'BG20_HERO_101_Buddy_G',
        dbfId: 21,
        name: 'Baby Elekk',
        type: 'MINION',
        techLevel: 3,
        isBattlegroundsBuddy: true,
        battlegroundsNormalDbfId: 20
      }
    ])
    expect(catalog).toHaveLength(1)
    expect(catalog[0].kind).toBe('buddy')
    expect(catalog[0].id).toBe('BG20_HERO_101_Buddy')
    expect(catalog[0].techLevel).toBe(3)
    expect(catalog[0].mechanics).toEqual(['Battlecry', 'Activate', 'Lockbox'])
    expect(heroBuddyCardId('BG20_HERO_101_SKIN_A')).toBe('BG20_HERO_101_Buddy')
    expect(heroHasBuddy('BG20_HERO_101_SKIN_A', catalog)).toBe(true)
    expect(heroHasBuddy('BG33_HERO_001', catalog)).toBe(false)
  })
})

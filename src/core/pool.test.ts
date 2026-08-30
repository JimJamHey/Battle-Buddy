import { describe, expect, it } from 'vitest'
import { groupPoolCards, minionsForTier, filterPoolGroups, filterGroupsByMechanic, poolCopies, splitGroupsByTier, cardAvailableInLobby, tribeAvailableInLobby, isTierGroupTitle, showPoolTierBubbles } from './pool'
import { mechanicsFromCard } from './mechanics'
import type { BgMinion } from './types'

function card(partial: Partial<BgMinion> & Pick<BgMinion, 'id' | 'name'>): BgMinion {
  return {
    dbfId: 1,
    text: '',
    attack: 1,
    health: 1,
    techLevel: 1,
    tribes: [],
    tileUrl: '',
    goldenId: `${partial.id}_G`,
    kind: 'minion',
    cost: 0,
    mechanics: [],
    ...partial
  }
}

describe('pool grouping', () => {
  it('groups by lobby tribes and keeps neutrals and spells', () => {
    const groups = groupPoolCards(
      [
        card({ id: 'd', name: 'Dragonling', tribes: ['Dragon'], techLevel: 2 }),
        card({ id: 'm', name: 'Mechbot', tribes: ['Mech'], techLevel: 1 }),
        card({ id: 'n', name: 'Amalgam', tribes: [] }),
        card({ id: 's', name: 'Coin', kind: 'spell', cost: 1 })
      ],
      ['Mech']
    )
    expect(groups.map((g) => g.title)).toEqual(['Mech', 'Dragon', 'No Type', 'Spells'])
    expect(groups[0].cards.map((c) => c.name)).toEqual(['Mechbot'])
    expect(groups.find((g) => g.title === 'Dragon')?.cards.map((c) => c.name)).toEqual(['Dragonling'])
  })

  it('keeps tavern spells and buddies as their own types', () => {
    const groups = groupPoolCards(
      [
        card({ id: 'm', name: 'Mechbot', tribes: ['Mech'] }),
        card({ id: 's', name: 'Shiny Ring', kind: 'spell', cost: 2, techLevel: 3, mechanics: ['Taunt'] }),
        card({
          id: 'BG20_HERO_101_Buddy',
          name: 'Baby Elekk',
          kind: 'buddy',
          techLevel: 3,
          mechanics: ['Battlecry']
        })
      ],
      []
    )
    expect(groups.map((g) => g.title)).toEqual(['Mech', 'Spells', 'Buddy'])
    expect(filterPoolGroups(groups, 'Buddy').flatMap((g) => g.cards.map((c) => c.name))).toEqual([
      'Baby Elekk'
    ])
    expect(filterGroupsByMechanic(groups, 'Battlecry').flatMap((g) => g.cards.map((c) => c.name))).toEqual([
      'Baby Elekk'
    ])
  })

  it('peeks one tavern or keeps shop-legal tiers in auto', () => {
    const cards = [
      card({ id: 'a', name: 'A', techLevel: 1 }),
      card({ id: 'b', name: 'B', techLevel: 3 }),
      card({ id: 'c', name: 'C', techLevel: 6 })
    ]
    expect(minionsForTier(cards, 0, 3).map((c) => c.id)).toEqual(['a', 'b'])
    expect(minionsForTier(cards, 6, 3).map((c) => c.id)).toEqual(['c'])
    expect(minionsForTier(cards, 0, 0).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('grays out off-lobby tribes without dropping them from the catalog', () => {
    const dragon = card({ id: 'd', name: 'Dragonling', tribes: ['Dragon'] })
    const mech = card({ id: 'm', name: 'Mechbot', tribes: ['Mech'] })
    const amalgam = card({ id: 'n', name: 'Amalgam', tribes: [] })
    expect(cardAvailableInLobby(dragon, ['Mech'])).toBe(false)
    expect(cardAvailableInLobby(mech, ['Mech'])).toBe(true)
    expect(cardAvailableInLobby(amalgam, ['Mech'])).toBe(true)
    expect(tribeAvailableInLobby('Dragon', ['Mech'])).toBe(false)
    expect(tribeAvailableInLobby('Dragon', ['Mech'], false, false)).toBe(true)
    expect(cardAvailableInLobby(dragon, ['Mech'], false, false)).toBe(true)
    expect(tribeAvailableInLobby('Mech', ['Mech'])).toBe(true)
    expect(tribeAvailableInLobby('No Type', ['Mech'])).toBe(true)
    expect(tribeAvailableInLobby('Spells', ['Mech'])).toBe(true)
    expect(tribeAvailableInLobby('Buddy', ['Mech'])).toBe(false)
    expect(tribeAvailableInLobby('Buddy', ['Mech', 'Buddy'])).toBe(true)
    expect(tribeAvailableInLobby('Buddy', [])).toBe(false)
    expect(tribeAvailableInLobby('Buddy', ['Mech'], true)).toBe(true)
    expect(cardAvailableInLobby(card({ id: 's', name: 'Coin', kind: 'spell' }), ['Mech'])).toBe(true)
    expect(cardAvailableInLobby(card({ id: 'b', name: 'Baby Elekk', kind: 'buddy' }), ['Mech'])).toBe(false)
    expect(cardAvailableInLobby(card({ id: 'b', name: 'Baby Elekk', kind: 'buddy' }), ['Buddy'])).toBe(true)
    expect(cardAvailableInLobby(card({ id: 'b', name: 'Baby Elekk', kind: 'buddy' }), ['Mech'], true)).toBe(true)
  })

  it('copies related neutrals into tribe groups and keeps them in Neutral', () => {
    const groups = groupPoolCards(
      [
        card({
          id: 'nomi',
          name: 'Nomi, Kitchen Nightmare',
          tribes: [],
          techLevel: 5,
          text: 'After you play an Elemental, give your Elementals +1/+1.'
        }),
        card({
          id: 'kangor',
          name: "Kangor's Apprentice",
          tribes: [],
          techLevel: 6,
          text: 'Deathrattle: Summon a 1/1 copy of 2 friendly Mechs.'
        }),
        card({ id: 'rock', name: 'Molten Rock', tribes: ['Elemental'], techLevel: 1 })
      ],
      []
    )
    expect(groups.find((g) => g.title === 'Elemental')?.cards.map((c) => c.name)).toEqual([
      'Molten Rock',
      'Nomi, Kitchen Nightmare'
    ])
    expect(groups.find((g) => g.title === 'Mech')?.cards.map((c) => c.name)).toEqual(["Kangor's Apprentice"])
    expect(groups.find((g) => g.title === 'No Type')?.cards.map((c) => c.name)).toEqual([
      'Nomi, Kitchen Nightmare',
      "Kangor's Apprentice"
    ])
  })

  it('splits a type filter into tavern-tier headers', () => {
    const groups = groupPoolCards(
      [
        card({ id: 'a', name: 'A', tribes: ['Elemental'], techLevel: 1 }),
        card({ id: 'b', name: 'B', tribes: ['Elemental'], techLevel: 3 })
      ],
      []
    )
    expect(splitGroupsByTier(filterPoolGroups(groups, 'Elemental')).map((g) => g.title)).toEqual([
      'Tier 1',
      'Tier 3'
    ])
    expect(isTierGroupTitle('Tier 5')).toBe(true)
    expect(isTierGroupTitle('Beast')).toBe(false)
    expect(showPoolTierBubbles(true, 0)).toBe(false)
    expect(showPoolTierBubbles(false, 5)).toBe(false)
    expect(showPoolTierBubbles(false, 0)).toBe(true)
  })

  it('narrows the pool to one tribe chip', () => {
    const groups = groupPoolCards(
      [
        card({ id: 'd', name: 'Dragonling', tribes: ['Dragon'] }),
        card({ id: 'm', name: 'Mechbot', tribes: ['Mech'] }),
        card({ id: 's', name: 'Coin', kind: 'spell', cost: 1 })
      ],
      []
    )
    expect(filterPoolGroups(groups, 'Dragon').map((g) => g.title)).toEqual(['Dragon'])
    expect(filterPoolGroups(groups, null).length).toBe(groups.length)
  })

  it('maps HSJSON race enums onto overlay tribe groups', () => {
    const groups = groupPoolCards(
      [
        card({ id: 'b', name: 'Bear', tribes: ['BEAST'] }),
        card({ id: 'm', name: 'Bot', tribes: ['MECHANICAL'] }),
        card({ id: 'q', name: 'Boar', tribes: ['QUILBOAR'] }),
        card({ id: 'a', name: 'Amalgam', tribes: ['ALL'] })
      ],
      []
    )
    expect(groups.map((g) => g.title)).toEqual(['Beast', 'Mech', 'Quilboar', 'No Type'])
    expect(groups.find((g) => g.title === 'No Type')?.cards.map((c) => c.name)).toEqual(['Amalgam'])
  })

  it('uses the current shared-pool copy counts', () => {
    expect(poolCopies(card({ id: 'a', name: 'A', techLevel: 1 }))).toBe(15)
    expect(poolCopies(card({ id: 'b', name: 'B', techLevel: 4 }))).toBe(11)
    expect(poolCopies(card({ id: 'c', name: 'C', techLevel: 7 }))).toBe(5)
    expect(poolCopies(card({ id: 's', name: 'Coin', kind: 'spell', cost: 1, techLevel: 3 }))).toBe(9)
    expect(poolCopies(card({ id: 'b', name: 'Baby Elekk', kind: 'buddy', techLevel: 3 }))).toBe(1)
  })

  it('filters groups down to one mechanic', () => {
    const groups = groupPoolCards(
      [
        card({ id: 't', name: 'Wall', tribes: ['Mech'], text: '<b>Taunt</b>', mechanics: ['Taunt'] }),
        card({ id: 'd', name: 'Boom', tribes: ['Mech'], text: '<b>Deathrattle</b>:', mechanics: ['Deathrattle'] })
      ],
      []
    )
    expect(filterGroupsByMechanic(groups, 'Taunt').flatMap((g) => g.cards.map((c) => c.name))).toEqual(['Wall'])
    expect(mechanicsFromCard(['TAUNT', 'DEATHRATTLE'], 'Rally: Go.')).toEqual(['Taunt', 'Deathrattle', 'Rally'])
    expect(
      mechanicsFromCard(['BACON_RALLY', 'END_OF_TURN_TRIGGER', 'CHOOSE_ONE', 'FRENZY'], 'Activate (1): Get a Lockbox.')
    ).toEqual(['Rally', 'Frenzy', 'Choose One', 'Activate', 'Lockbox', 'End of Turn'])
  })
})

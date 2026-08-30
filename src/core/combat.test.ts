import { describe, expect, it } from 'vitest'
import { fightOnce, parseCardCombat, parseDeathrattleSummon, parseStartOfCombat, simulateCombat, combatInputHasGaps, type CombatInput } from './combatSim'
import { BoardTracker } from './entities'
import { mapBattleNetRegion } from '../platform/battleNet'

function side(
  playerId: number,
  minions: CombatInput['friendly']['minions'],
  hp = 30,
  tavernTier = 0
): CombatInput['friendly'] {
  return { playerId, name: `P${playerId}`, heroHealth: hp, heroArmor: 0, tavernTier, minions }
}

function minion(
  attack: number,
  health: number,
  extra: Partial<CombatInput['friendly']['minions'][0]> = {}
): CombatInput['friendly']['minions'][0] {
  return {
    cardId: extra.cardId ?? 'X',
    name: extra.name ?? 'Minion',
    attack,
    health,
    divineShield: false,
    taunt: false,
    poisonous: false,
    venomous: false,
    reborn: false,
    windfury: false,
    megaWindfury: false,
    deathrattle: false,
    ...extra
  }
}

describe('combat sim', () => {
  it('wins a 10/10 into an empty board and counts lethal', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(10, 10)], 30),
      opponent: side(2, [], 8)
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
    expect(r.damageToOpponent).toBe(10)
  })

  it('adds tavern tier to leftover attack', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(10, 10)], 30, 4),
      opponent: side(2, [], 8, 1)
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.damageToOpponent).toBe(14)
  })

  it('divine shield eats the first hit', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(1, 1)]),
      opponent: side(2, [minion(1, 1, { divineShield: true })])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('opponent')
  })

  it('poisonous kills through health', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(1, 5, { poisonous: true })]),
      opponent: side(2, [minion(1, 20)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('returns percents that sum near 100', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(2, 2), minion(2, 2)]),
      opponent: side(2, [minion(2, 2), minion(2, 2)])
    }
    const odds = simulateCombat(input, {}, 200, () => 0.4)
    expect(odds.win + odds.tie + odds.loss).toBeGreaterThanOrEqual(99)
  })

  it('parses deathrattle summons', () => {
    expect(parseDeathrattleSummon('Deathrattle: Summon a 1/1 Imp.')).toEqual({
      count: 1,
      attack: 1,
      health: 1
    })
    expect(parseDeathrattleSummon('Deathrattle: Summon two 2/2 Hyenas.')).toEqual({
      count: 2,
      attack: 2,
      health: 2
    })
    expect(parseCardCombat('Your Deathrattles trigger an extra time.').extraDeathrattles).toBe(1)
    expect(
      parseCardCombat('Rally: Gain +2 Attack.').triggers.some(
        (row) => row.when === 'rally' && row.effects[0]?.op === 'buff'
      )
    ).toBe(true)
  })

  it('parses start of combat damage and cleaves adjacent minions', () => {
    expect(parseStartOfCombat('Start of Combat: Deal 3 damage to a random enemy minion.')).toEqual([
      { kind: 'damageRandom', damage: 3, count: 1 }
    ])
    const input: CombatInput = {
      friendly: side(1, [minion(10, 4, { cleave: true })]),
      opponent: side(2, [minion(1, 5, { name: 'A' }), minion(1, 5, { name: 'B' })])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('Titus makes deathrattles summon twice', () => {
    const input: CombatInput = {
      friendly: side(1, [
        minion(1, 1, { deathrattle: true, cardId: 'BONE' }),
        minion(0, 1, {
          cardId: 'TITUS',
          kit: { triggers: [], extraDeathrattles: 1, cleave: false }
        })
      ]),
      opponent: side(2, [minion(1, 1)])
    }
    const r = fightOnce(input, { BONE: { count: 2, attack: 1, health: 1 } }, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('skips 0-attack minions so they do not eat a counterattack', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(0, 5)]),
      opponent: side(2, [minion(5, 5)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('opponent')
  })

  it('reborn keeps a 1-health body after the deathrattle', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(1, 1, { reborn: true, deathrattle: true, cardId: 'DR' })]),
      opponent: side(2, [minion(1, 1)])
    }
    const r = fightOnce(input, { DR: { count: 1, attack: 1, health: 1 } }, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('consumes venomous after it deals damage', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(1, 5, { venomous: true })]),
      opponent: side(2, [minion(1, 20), minion(1, 20)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('opponent')
  })

  it('summons a minion from hand when the deathrattle says so', () => {
    const input: CombatInput = {
      friendly: {
        ...side(1, [
          minion(1, 1, {
            deathrattle: true,
            kit: { triggers: [{ when: 'deathrattle', effects: [{ op: 'summonFromHand' }] }], extraDeathrattles: 0, cleave: false }
          })
        ]),
        hand: [minion(8, 8, { name: 'Backup' })]
      },
      opponent: side(2, [minion(1, 1)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('runs trinket start-of-combat damage', () => {
    const input: CombatInput = {
      friendly: {
        ...side(1, [minion(1, 5)]),
        trinkets: [
          minion(0, 0, {
            name: 'Zap',
            kit: {
              triggers: [{ when: 'startOfCombat', effects: [{ op: 'damage', attack: 10, target: 'allEnemy' }] }],
              extraDeathrattles: 0,
              cleave: false
            }
          })
        ]
      },
      opponent: side(2, [minion(1, 4)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })
})

describe('board tracker', () => {
  it('snapshots both boards when combat starts', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : 'Them')
    const lines = [
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=3',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_CURRENT_COMBAT_PLAYER_ID value=2',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1'
    ]
    let event = null
    for (const line of lines) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('start')
    const frozen = t.getFrozen()
    expect(frozen?.friendly.minions[0]?.attack).toBe(4)
    expect(frozen?.opponent.minions[0]?.attack).toBe(3)
    t.feed('D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0', 1, name)
    expect(t.getFrozen()?.friendly.minions[0]?.attack).toBe(4)
    t.feed('D 12:00 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0', 1, name)
    expect(t.getFrozen()).toBeNull()
  })

  it('freezes after minions appear following the combat-phase tag', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : 'Them')
    expect(
      t.feed(
        'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
        1,
        name
      )
    ).toBeNull()
    const lines = [
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=5',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=5',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    let event = null
    for (const line of lines) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('start')
    expect(t.getFrozen()?.friendly.minions[0]?.attack).toBe(5)
    expect(t.getFrozen()?.opponent.minions[0]?.attack).toBe(2)
  })

  it('does not freeze a combat board against yourself', () => {
    const t = new BoardTracker()
    const name = (id: number) => `P${id}`
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BG_SELF',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=5',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=5',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]) {
      t.feed(line, 1, name)
    }
    expect(t.getFrozen()).toBeNull()
  })
})

describe('combat gaps', () => {
  it('flags unmodeled combat scripts as partial', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(1, 1, { cardId: 'FR', name: 'Frenzy Bot' })]),
      opponent: side(2, [minion(1, 1)])
    }
    expect(combatInputHasGaps(input, [{ id: 'FR', name: 'Frenzy Bot', text: '', mechanics: ['Frenzy'] }])).toBe(true)
    expect(combatInputHasGaps(input, [{ id: 'FR', name: 'Frenzy Bot', text: '<b>Taunt</b>', mechanics: ['Taunt'] }])).toBe(
      false
    )
    expect(
      combatInputHasGaps(
        { friendly: side(1, [minion(1, 1, { cardId: 'DR', name: 'DR Bot', deathrattle: true })]), opponent: side(2, [minion(1, 1)]) },
        [{ id: 'DR', name: 'DR Bot', text: '', mechanics: ['Deathrattle'] }]
      )
    ).toBe(true)
  })
})

describe('region map', () => {
  it('maps Battle.net regions onto leaderboard regions', () => {
    expect(mapBattleNetRegion('EU')).toBe('EU')
    expect(mapBattleNetRegion('kr')).toBe('AP')
    expect(mapBattleNetRegion('US')).toBe('US')
  })
})

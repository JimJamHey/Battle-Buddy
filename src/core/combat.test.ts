import { describe, expect, it } from 'vitest'
import {
  COMBAT_KITS,
  collectNamedSummonNames,
  combatInputHasGaps,
  combatParseGaps,
  enrichCombatInput,
  fightOnce,
  lookupCombatKit,
  parseCardCombat,
  parseDeathrattleSummon,
  parseStartOfCombat,
  simulateCombat,
  type CombatInput
} from './combatSim'
import { buildSummonPools, pickRandomSummon } from './combatSummonPools'
import { BoardTracker } from './entities'

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
    expect(parseCardCombat('Your Deathrattles trigger two extra times.').extraDeathrattles).toBe(2)
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

  it('keeps attacking on the same side after a 0-attack minion', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(0, 5), minion(10, 1)]),
      opponent: side(2, [minion(8, 8)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
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

  it('summons the highest-attack murloc from hand at start of combat', () => {
    const forager = minion(4, 5, {
      cardId: 'BG27_556',
      name: 'Diremuck Forager',
      tribes: ['Murloc'],
      kit: {
        triggers: [
          {
            when: 'startOfCombat',
            effects: [{ op: 'summonFromHand', count: 1, tribe: 'Murloc', select: 'highestAttack' }]
          }
        ],
        extraDeathrattles: 0,
        cleave: false
      }
    })
    const input: CombatInput = {
      friendly: {
        ...side(1, [forager, minion(1, 1)]),
        hand: [
          minion(3, 3, { name: 'Small Murloc', tribes: ['Murloc'] }),
          minion(8, 2, { name: 'Big Murloc', tribes: ['Murloc'] })
        ]
      },
      opponent: side(2, [minion(1, 1)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('parses highest-attack murloc hand summon text', () => {
    const kit = parseCardCombat(
      'Start of Combat: When you have space, summon the highest-Attack Murloc from your hand for this combat only.'
    )
    const fx = kit.triggers.find((row) => row.when === 'startOfCombat')?.effects[0]
    expect(fx).toMatchObject({
      op: 'summonFromHand',
      tribe: 'Murloc',
      select: 'highestAttack',
      requiresSpace: true
    })
  })

  it('skips hand summons when the board is full and space is required', () => {
    const forager = minion(4, 5, {
      cardId: 'BG27_556',
      tribes: ['Murloc'],
      kit: {
        triggers: [
          {
            when: 'startOfCombat',
            effects: [
              {
                op: 'summonFromHand',
                count: 1,
                tribe: 'Murloc',
                select: 'highestAttack',
                requiresSpace: true
              }
            ]
          }
        ],
        extraDeathrattles: 0,
        cleave: false
      }
    })
    const fillers = Array.from({ length: 6 }, () => minion(1, 1))
    const input: CombatInput = {
      friendly: {
        ...side(1, [forager, ...fillers]),
        hand: [minion(20, 20, { name: 'Big Murloc', tribes: ['Murloc'] })]
      },
      opponent: side(2, [minion(15, 15)])
    }
    const blocked = fightOnce(input, {}, () => 0, true)
    expect(blocked.win).toBe('opponent')
    const inputWithSpace: CombatInput = {
      friendly: {
        ...side(1, [forager, minion(1, 1)]),
        hand: [minion(20, 20, { name: 'Big Murloc', tribes: ['Murloc'] })]
      },
      opponent: side(2, [minion(15, 15)])
    }
    const allowed = fightOnce(inputWithSpace, {}, () => 0, true)
    expect(allowed.win).toBe('friendly')
  })

  it('buffs listeners when a matching tribe is summoned during combat', () => {
    const bot = minion(3, 2, {
      tribes: ['Mech'],
      divineShield: true,
      kit: {
        triggers: [
          {
            when: 'onSummon',
            summonTribe: 'Mech',
            effects: [{ op: 'buff', target: 'self', attack: 2, keywords: ['divineShield'] }]
          }
        ],
        extraDeathrattles: 0,
        cleave: false
      }
    })
    const input: CombatInput = {
      friendly: {
        ...side(1, [
          bot,
          minion(1, 1, {
            deathrattle: true,
            kit: {
              triggers: [
                {
                  when: 'deathrattle',
                  effects: [{ op: 'summon', count: 1, attack: 1, health: 1, name: 'Spawn Mech' }]
                }
              ],
              extraDeathrattles: 0,
              cleave: false
            }
          })
        ])
      },
      opponent: side(2, [minion(1, 1)]),
      named: {
        'spawn mech': { attack: 1, health: 1, kit: { triggers: [], extraDeathrattles: 0, cleave: false }, tribes: ['Mech'] }
      }
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('summons from a tribe pool for random summon effects', () => {
    const pools = buildSummonPools([
      { id: 'M1', name: 'Pool Murloc', attack: 5, health: 5, tribes: ['Murloc'], kind: 'minion' }
    ])
    const input: CombatInput = {
      friendly: side(1, [
        minion(1, 1, {
          kit: {
            triggers: [
              {
                when: 'startOfCombat',
                effects: [{ op: 'summonRandom', count: 1, tribe: 'Murloc' }]
              }
            ],
            extraDeathrattles: 0,
            cleave: false
          }
        })
      ]),
      opponent: side(2, [minion(1, 3)])
    }
    const r = fightOnce(input, {}, () => 0, true, new Map(), pools)
    expect(r.win).toBe('friendly')
  })

  it('marks missing tribe summon pools as partial', () => {
    const input = enrichCombatInput(
      {
        friendly: side(1, [
          minion(1, 1, {
            cardId: 'RAND',
            kit: {
              triggers: [{ when: 'deathrattle', effects: [{ op: 'summonRandom', tribe: 'Murloc' }] }],
              extraDeathrattles: 0,
              cleave: false
            }
          })
        ]),
        opponent: side(2, [minion(1, 1)])
      },
      [{ id: 'RAND', name: 'Random', text: 'Deathrattle: Summon a random Murloc.' }]
    )
    expect(combatInputHasGaps(input, [{ id: 'RAND', name: 'Random', text: 'Deathrattle: Summon a random Murloc.' }], {})).toBe(
      true
    )
    const pools = buildSummonPools([{ id: 'M1', name: 'M', attack: 1, health: 1, tribes: ['Murloc'], kind: 'minion' }])
    expect(
      combatInputHasGaps(input, [{ id: 'RAND', name: 'Random', text: 'Deathrattle: Summon a random Murloc.' }], pools)
    ).toBe(false)
  })

  it('prefers summon pool cards near tavern tier', () => {
    const picked = pickRandomSummon(
      buildSummonPools([
        { id: 'T1', name: 'Low', attack: 1, health: 1, tribes: ['Beast'], techLevel: 1, kind: 'minion' },
        { id: 'T5', name: 'High', attack: 9, health: 9, tribes: ['Beast'], techLevel: 5, kind: 'minion' }
      ]),
      'Beast',
      () => 0.25,
      5
    )
    expect(picked?.cardId).toBe('T5')
  })

  it('does not let a summoned minion trigger its own onSummon', () => {
    const selfSummoner = minion(1, 1, {
      kit: {
        triggers: [
          {
            when: 'deathrattle',
            effects: [{ op: 'summon', count: 1, attack: 1, health: 1, name: 'Echo Mech' }]
          },
          {
            when: 'onSummon',
            summonTribe: 'Mech',
            effects: [{ op: 'buff', target: 'self', attack: 99 }]
          }
        ],
        extraDeathrattles: 0,
        cleave: false
      },
      tribes: ['Mech']
    })
    const input: CombatInput = {
      friendly: side(1, [selfSummoner]),
      opponent: side(2, [minion(1, 20, { taunt: true })]),
      named: {
        'echo mech': {
          attack: 1,
          health: 1,
          kit: selfSummoner.kit!,
          tribes: ['Mech']
        }
      }
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('opponent')
  })

  it('uses golden Deflect-o-Bot kit buff values', () => {
    const text =
      'Divine Shield Whenever you summon a Mech during combat, gain +2 Attack and Divine Shield.'
    const golden = lookupCombatKit('BGS_071_G', text)
    const fx = golden.triggers.find((row) => row.when === 'onSummon')?.effects[0]
    expect(fx).toMatchObject({ op: 'buff', attack: 4, keywords: ['divineShield'] })
  })

  it('does not register the full catalog into named summon bodies', () => {
    const catalog = [
      { id: 'IMP', name: 'Imp', attack: 99, health: 99, text: 'A demon.' },
      { id: 'DR', name: 'Spawner', text: 'Deathrattle: Summon a 1/1 Imp.' }
    ]
    const input = enrichCombatInput(
      {
        friendly: side(1, [
          minion(1, 1, {
            cardId: 'DR',
            deathrattle: true,
            kit: parseCardCombat('Deathrattle: Summon a 1/1 Imp.')
          })
        ]),
        opponent: side(2, [minion(1, 1)])
      },
      catalog
    )
    expect(collectNamedSummonNames(input)).toEqual(new Set())
    expect(input.named?.imp).toBeUndefined()
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('only adds explicit named summons referenced on the board', () => {
    const catalog = [
      { id: 'BEETLE', name: 'Beetle', attack: 2, health: 3, text: 'Buzz.' },
      { id: 'OTHER', name: 'Other', attack: 9, health: 9, text: 'Nope.' }
    ]
    const input = enrichCombatInput(
      {
        friendly: side(1, [
          minion(1, 1, {
            kit: {
              triggers: [
                {
                  when: 'deathrattle',
                  effects: [{ op: 'summon', count: 1, name: 'Beetle' }]
                }
              ],
              extraDeathrattles: 0,
              cleave: false
            }
          })
        ]),
        opponent: side(2, [minion(1, 1)])
      },
      catalog
    )
    expect(input.named?.beetle).toMatchObject({ attack: 2, health: 3 })
    expect(input.named?.other).toBeUndefined()
  })

  it('stealAttack removes attack from the defender', () => {
    const input: CombatInput = {
      friendly: side(1, [
        minion(8, 8, {
          kit: {
            triggers: [
              {
                when: 'afterKill',
                effects: [{ op: 'stealAttack' }]
              }
            ],
            extraDeathrattles: 0,
            cleave: false
          }
        })
      ]),
      opponent: side(2, [minion(5, 1)])
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

  it('uses combat clone controllers so odds are not 100% loss on an empty lobby id', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : id === 8 ? 'Them' : `P${id}`)
    t.setCombatOpponent(8, 'Them')
    const lines = [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_CURRENT_COMBAT_PLAYER_ID value=18',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=15',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=18',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=30',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    let event = null
    for (const line of lines) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('start')
    const frozen = t.getFrozen()
    expect(frozen?.friendly.minions).toHaveLength(1)
    expect(frozen?.friendly.minions[0]?.attack).toBe(8)
    expect(frozen?.opponent.minions[0]?.attack).toBe(2)
    expect(frozen?.opponent.minions[0]?.health).toBe(30)
    expect(frozen?.opponent.playerId).toBe(8)
  })

  it('does not treat our clone board as the opponent when they have no minions', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : id === 8 ? 'Them' : `P${id}`)
    t.setCombatOpponent(8, 'Them')
    const setup = [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_CURRENT_COMBAT_PLAYER_ID value=18',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=15',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    for (const line of setup) {
      expect(t.feed(line, 1, name)).toBeNull()
    }
    expect(t.getFrozen()).toBeNull()
    expect(
      t.feed('D 12:00 GameState.DebugPrintPower() - BLOCK_START BlockType=ATTACK Entity=10', 1, name)
    ).toBe('start')
    const frozen = t.getFrozen()
    expect(frozen?.friendly.minions).toHaveLength(1)
    expect(frozen?.friendly.minions[0]?.attack).toBe(8)
    expect(frozen?.opponent.minions).toHaveLength(0)
    expect(frozen?.opponent.playerId).toBe(8)
  })

  it('upgrades an early empty-opponent freeze once their clones appear', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : id === 8 ? 'Them' : `P${id}`)
    t.setCombatOpponent(8, 'Them')
    const setup = [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_CURRENT_COMBAT_PLAYER_ID value=18',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=15',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    for (const line of setup) t.feed(line, 1, name)
    expect(
      t.feed('D 12:00 GameState.DebugPrintPower() - BLOCK_START BlockType=ATTACK Entity=10', 1, name)
    ).toBe('start')
    expect(t.getFrozen()?.opponent.minions).toHaveLength(0)
    const late = [
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=18',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=2',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=30',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    let event = null
    for (const line of late) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('update')
    expect(t.getFrozen()?.opponent.minions).toHaveLength(1)
    expect(t.getFrozen()?.opponent.minions[0]?.attack).toBe(2)
    expect(t.getFrozen()?.friendly.minions[0]?.attack).toBe(8)
  })

  it('emits update when hand minions arrive after the first board freeze', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : 'Them')
    const boardLines = [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
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
    for (const line of boardLines) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('start')
    expect(t.getFrozen()?.friendly.hand).toEqual([])
    const handLines = [
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=30 CardID=BGS_HAND',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=3',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=9',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    event = null
    for (const line of handLines) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('update')
    expect(t.getFrozen()?.friendly.hand?.[0]?.attack).toBe(9)
    expect(t.isSnapshotLocked()).toBe(false)
    expect(t.feed('D 12:00 GameState.DebugPrintPower() - BLOCK_START BlockType=ATTACK Entity=10', 1, name)).toBe(
      'start'
    )
    expect(t.isSnapshotLocked()).toBe(true)
    expect(
      t.feed('D 12:00 GameState.DebugPrintPower() - BLOCK_START BlockType=ATTACK Entity=11', 1, name)
    ).toBeNull()
  })

  it('emits update when hand arrives after attack lock', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : 'Them')
    const boardLines = [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
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
    for (const line of boardLines) t.feed(line, 1, name)
    expect(t.feed('D 12:00 GameState.DebugPrintPower() - BLOCK_START BlockType=ATTACK Entity=10', 1, name)).toBe(
      'start'
    )
    expect(t.getFrozen()?.friendly.hand).toEqual([])
    const handLines = [
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=30 CardID=BGS_HAND',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=3',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=9',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1'
    ]
    let event = null
    for (const line of handLines) event = t.feed(line, 1, name) ?? event
    expect(event).toBe('update')
    expect(t.getFrozen()?.friendly.hand?.[0]?.attack).toBe(9)
  })

  it('emits update when board stats change after attack lock', () => {
    const t = new BoardTracker()
    const name = (id: number) => (id === 1 ? 'Me' : 'Them')
    const boardLines = [
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
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
    for (const line of boardLines) t.feed(line, 1, name)
    expect(t.feed('D 12:00 GameState.DebugPrintPower() - BLOCK_START BlockType=ATTACK Entity=10', 1, name)).toBe(
      'start'
    )
    let event = t.feed('D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=10 tag=ATK value=12', 1, name)
    expect(event).toBe('update')
    expect(t.getFrozen()?.friendly.minions[0]?.attack).toBe(12)
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

describe('combat kit registry', () => {
  it('overlays a kit on text parse for a fake card id', () => {
    const id = 'TEST_KIT_FAKE'
    COMBAT_KITS[id] = {
      extraDeathrattles: 3,
      triggers: [{ when: 'deathrattle', effects: [{ op: 'summon', count: 9, attack: 9, health: 9 }] }]
    }
    try {
      const kit = lookupCombatKit(id, 'Deathrattle: Summon a 1/1 Imp.')
      expect(kit.extraDeathrattles).toBe(3)
      expect(kit.triggers.find((row) => row.when === 'deathrattle')?.effects[0]).toMatchObject({
        op: 'summon',
        count: 9,
        attack: 9,
        health: 9
      })
      const golden = lookupCombatKit(`${id}_G`, 'Deathrattle: Summon a 1/1 Imp.')
      expect(golden.extraDeathrattles).toBe(3)
    } finally {
      delete COMBAT_KITS[id]
    }
  })

  it('looks up golden _G summons from the base card id', () => {
    const input: CombatInput = {
      friendly: side(1, [
        minion(1, 1, { deathrattle: true, cardId: 'BONE_G' }),
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

  it('fills dealt and taken damage min/max', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(10, 10)], 30, 4),
      opponent: side(2, [], 8, 1)
    }
    const odds = simulateCombat(input, {}, 12, () => 0)
    expect(odds.dealtMin).toBe(14)
    expect(odds.dealtMax).toBe(14)
    expect(odds.takenMin).toBe(0)
    expect(odds.takenMax).toBe(0)
  })

  it('keeps a same-clause deathrattle buff after a summon', () => {
    const kit = parseCardCombat('Deathrattle: Summon a 1/1 Imp and give your other minions +2/+2.')
    const effects = kit.triggers.find((row) => row.when === 'deathrattle')?.effects ?? []
    expect(effects.some((fx) => fx.op === 'summon' && fx.attack === 1 && fx.health === 1)).toBe(true)
    expect(effects.some((fx) => fx.op === 'buff' && fx.attack === 2 && fx.health === 2 && fx.target === 'otherFriendly')).toBe(
      true
    )
    expect(parseCardCombat('Rally: Give your minions +1/+1.').triggers[0]?.effects[0]?.target).toBe('allFriendly')
    expect(
      parseCardCombat('Start of Combat: Deal 3 damage to an enemy minion.').triggers[0]?.effects[0]?.target
    ).toBe('randomEnemy')
  })

  it('must hit taunt instead of a fatter body', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(5, 5)]),
      opponent: side(2, [minion(5, 5), minion(0, 1, { taunt: true })])
    }
    const r = fightOnce(input, {}, () => 0, true)
    // Correct: first swing eats the 0-attack taunt, then the 5/5s trade — tie.
    // If taunt is ignored, the 5/5s trade immediately and the taunt is leftover — loss.
    expect(r.win).toBe('tie')
  })

  it('seeds the same freeze to the same percentages', () => {
    const input: CombatInput = {
      friendly: side(1, [minion(3, 3), minion(2, 2)]),
      opponent: side(2, [minion(3, 3), minion(2, 2)])
    }
    expect(simulateCombat(input, {}, 80)).toEqual(simulateCombat(input, {}, 80))
  })

  it('uses opponent gem size on their play-gem scripts', () => {
    const gemmer = (id: string) =>
      minion(1, 1, {
        cardId: id,
        kit: {
          triggers: [{ when: 'startOfCombat', effects: [{ op: 'playGem', target: 'self' }] }],
          extraDeathrattles: 0,
          cleave: false
        }
      })
    const input: CombatInput = {
      friendly: side(1, [gemmer('G1')]),
      opponent: side(2, [gemmer('G2')]),
      gems: { attack: 1, health: 1 },
      opponentGems: { attack: 20, health: 20 }
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('opponent')
  })

  it('covers a kit SoC so Upper Hand is not partial', () => {
    const input = enrichCombatInput(
      { friendly: side(1, [minion(1, 1, { cardId: 'BG28_573', name: 'Upper Hand' })]), opponent: side(2, [minion(1, 1)]) },
      [
        {
          id: 'BG28_573',
          name: 'Upper Hand',
          text: 'Start of Combat: Set a random enemy minion\'s Health to 1.',
          mechanics: ['Start of Combat']
        }
      ]
    )
    expect(combatInputHasGaps(input, [
      {
        id: 'BG28_573',
        name: 'Upper Hand',
        text: 'Start of Combat: Set a random enemy minion\'s Health to 1.',
        mechanics: ['Start of Combat']
      }
    ])).toBe(false)
  })

  it('sets health from a start-of-combat kit', () => {
    const input: CombatInput = {
      friendly: side(1, [
        minion(1, 5, {
          kit: {
            triggers: [{ when: 'startOfCombat', effects: [{ op: 'setHealth', health: 1, target: 'randomEnemy' }] }],
            extraDeathrattles: 0,
            cleave: false
          }
        })
      ]),
      opponent: side(2, [minion(1, 20)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })

  it('still marks Frenzy and unparsed deathrattles as partial after enrich', () => {
    const frenzy = enrichCombatInput(
      { friendly: side(1, [minion(1, 1, { cardId: 'FR', name: 'Frenzy Bot' })]), opponent: side(2, [minion(1, 1)]) },
      [{ id: 'FR', name: 'Frenzy Bot', text: '', mechanics: ['Frenzy'] }]
    )
    expect(combatInputHasGaps(frenzy, [{ id: 'FR', name: 'Frenzy Bot', text: '', mechanics: ['Frenzy'] }])).toBe(true)
    const dr = enrichCombatInput(
      {
        friendly: side(1, [minion(1, 1, { cardId: 'DR', name: 'DR Bot', deathrattle: true })]),
        opponent: side(2, [minion(1, 1)])
      },
      [{ id: 'DR', name: 'DR Bot', text: '', mechanics: ['Deathrattle'] }]
    )
    expect(combatInputHasGaps(dr, [{ id: 'DR', name: 'DR Bot', text: '', mechanics: ['Deathrattle'] }])).toBe(true)
  })

  it('flags a half-parsed deathrattle leftover as unparsed', () => {
    expect(
      combatParseGaps('Deathrattle: Summon a 1/1 Imp. Also swallow the enemy warband.')
    ).toContain('Unparsed')
    expect(combatParseGaps('Deathrattle: Summon a 1/1 Imp.')).not.toContain('Unparsed')
  })

  it('flags copy-deathrattle and random summons instead of pretending they work', () => {
    expect(combatParseGaps('Deathrattle: Copy a random deathrattle.')).toEqual(
      expect.arrayContaining(['Deathrattle', 'Copy Deathrattle'])
    )
    expect(combatParseGaps('Start of Combat: Summon a random Beast.')).not.toContain('Random summon')
    expect(combatParseGaps('Start of Combat: Summon a random minion.')).toContain('Random summon')
  })

  it('only treats this-game text as a gap when it sits on a combat trigger', () => {
    expect(combatParseGaps('After you play a minion, give it +1/+1 this game.')).not.toContain('This game')
    expect(combatParseGaps('Deathrattle: Give your minions +1/+1 this game.')).toContain('This game')
    expect(combatParseGaps('Start of Combat: Give your minions +1/+1 for each friendly Beast.')).toContain('Scaled')
    expect(parseCardCombat('Deathrattle: Summon a 1/1 copy of a friendly Mech.').triggers).toEqual([])
    expect(combatParseGaps('Deathrattle: Summon a 1/1 copy of a friendly Mech.')).toContain('Deathrattle')
  })

  it('uses strike leftover on adjacent overkill, not the attacker leftover', () => {
    const input: CombatInput = {
      friendly: side(1, [
        minion(10, 10, {
          kit: {
            triggers: [{ when: 'afterKill', effects: [{ op: 'damage', count: -2, target: 'adjacentEnemy' }] }],
            extraDeathrattles: 0,
            cleave: false
          }
        })
      ]),
      opponent: side(2, [minion(1, 3), minion(0, 1)])
    }
    const r = fightOnce(input, {}, () => 0, true)
    expect(r.win).toBe('friendly')
  })
})


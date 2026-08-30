import { describe, expect, it } from 'vitest'
import { selectSessionLogDir } from './logPaths'
import { BattlegroundsParser, baconPhaseLabel, isCombatSpectatorCreateGame, isPlaceholderName } from './parser'
import { mergeLogConfig } from './logConfig'
import { matchLobby, indexLeaderboard } from './mmr'
import { catalogFromCardsJson, cardTileUrls, cardSlug, cardGoldenRenderUrls, boardCardUrls, baseCardId, heroBuddyCardId, heroHasBuddy, type RawCard } from './cards'
import { applyGameMmr, applyRatingObservation, bindCurrentMmr, recordFinish, emptySession, ensureToday, averageFinish, dedupeGames, gameMmrIsSettled } from './session'

describe('logConfig', () => {
  it('adds Power and LoadingScreen without wiping other sections', () => {
    const { next, changed } = mergeLogConfig('[Arena]\nLogLevel=1\n')
    expect(changed).toBe(true)
    expect(next).toContain('[Arena]')
    expect(next).toContain('[Power]')
    expect(next).toContain('FilePrinting=true')
    expect(next).toContain('[LoadingScreen]')
    expect(next).toContain('[GameNet]')
  })

  it('is idempotent when already configured', () => {
    const first = mergeLogConfig('')
    const second = mergeLogConfig(first.next)
    expect(second.changed).toBe(false)
  })
})

describe('log paths', () => {
  it('picks the newest Hearthstone session folder even before Power.log exists', () => {
    expect(
      selectSessionLogDir([
        { name: 'Hearthstone_2026_08_24_10_00_00', mtimeMs: 10, hasPowerLog: true },
        { name: 'Hearthstone_2026_08_25_11_40_57', mtimeMs: 25, hasPowerLog: false },
        { name: 'other', mtimeMs: 99, hasPowerLog: true }
      ])
    ).toBe('Hearthstone_2026_08_25_11_40_57')
  })
})

describe('parser', () => {
  it('tracks a solo battlegrounds match from Power.log lines', () => {
    const p = new BattlegroundsParser('Jaren')
    const lines = [
      'D 12:00:00.0 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00:00.0 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00:00.0 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Jaren#1234',
      'D 12:00:00.0 GameState.DebugPrintGame() - PlayerID=2, PlayerName=Prophane#9',
      'D 12:00:00.0 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=6',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=4',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_LEADERBOARD_PLACE value=3',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE'
    ]
    let completed: { placement: number; turn: number } | null = null
    for (const line of lines) {
      const r = p.feed(line)
      if (r.completed) completed = r.completed
    }
    const match = p.getMatch()
    expect(match.inBattlegrounds).toBe(true)
    expect(match.turn).toBe(3)
    expect(match.tavernTier).toBe(4)
    expect(match.lobby.map((l) => l.rawName)).toEqual(['Jaren#1234', 'Prophane#9'])
    expect(completed).toEqual({ placement: 3, turn: 3, matchKey: '12:00:00.0' })
  })

  it('treats hero select as Turn 1 before Power.log writes TURN', () => {
    const p = new BattlegroundsParser('Jaren')
    p.feed('D 12:00:00.0 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:00:00.0 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    const match = p.getMatch()
    expect(match.gameActive).toBe(true)
    expect(match.turn).toBe(1)
    expect(match.rawTurn).toBe(1)
    expect(baconPhaseLabel(match.rawTurn, match.inCombat, match.turn)).toBe('Turn 1')
  })

  it('reads lobby tribes and ignores Bob at hero select', () => {
    const p = new BattlegroundsParser('Jaren')
    const lines = [
      'D 12:00:00.0 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00:00.0 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00:00.0 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Jaren#1234',
      'D 12:00:00.0 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_DEMON value=1',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_DRAGON value=1',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_ELEMENTALS value=1',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_QUILLBOAR value=1',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_UNDEAD value=1',
      'D 12:00:00.0 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Lady Deathwhisper id=76 zone=PLAY zonePos=0 cardId=TB_BaconShop_HERO_KelThuzad player=1] CardID=TB_BaconShop_HERO_KelThuzad',
      'D 12:00:00.0 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=HERO_ENTITY value=76'
    ]
    for (const line of lines) p.feed(line)
    const match = p.getMatch()
    expect(match.heroCardId).toBeNull()
    expect(match.availableTribes).toEqual(['Demon', 'Dragon', 'Elemental', 'Quilboar', 'Undead'])
    expect(match.tribesComplete).toBe(true)
  })

  it('treats BACON_BUDDY_ENABLED as the Buddy type being in the lobby', () => {
    const p = new BattlegroundsParser('Jaren')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MECH value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_BUDDY_ENABLED value=1'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().availableTribes).toEqual(['Mech', 'Buddy'])
  })

  it('marks Buddy available when a buddy minion appears', () => {
    const p = new BattlegroundsParser('Jaren')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MECH value=1',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Baby Elekk id=80 zone=PLAY zonePos=1 cardId=BG20_HERO_101_Buddy player=1] CardID=BG20_HERO_101_Buddy'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().availableTribes).toEqual(['Mech', 'Buddy'])
  })

  it('locks the picked hero and does not overwrite it with a combat clone', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=2, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=5 PlayerID=2 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Chenvaala id=117 zone=PLAY zonePos=0 cardId=TB_BaconShop_HERO_78_SKIN_C player=2] CardID=TB_BaconShop_HERO_78_SKIN_C'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().heroCardId).toBe('TB_BaconShop_HERO_78_SKIN_C')
    expect(p.getMatch().heroName).toBe('Chenvaala')
    p.feed(
      'D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1'
    )
    p.feed(
      'D 12:10 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Buttons id=900 zone=PLAY zonePos=0 cardId=BG32_HERO_002 player=2] CardID=BG32_HERO_002'
    )
    expect(p.getMatch().heroCardId).toBe('TB_BaconShop_HERO_78_SKIN_C')
    expect(p.getMatch().heroName).toBe('Chenvaala')
  })

  it('reads tavern and hero from Battlegrounds player ids and BattleTag tags', () => {
    const p = new BattlegroundsParser('JimJamHey')
    const lines = [
      'D 14:05 GameState.DebugPrintPower() - CREATE_GAME',
      'D 14:05 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 14:05 GameState.DebugPrintGame() - PlayerID=6, PlayerName=JimJamHey#1968',
      'D 14:05 GameState.DebugPrintGame() - PlayerID=14, PlayerName=SuperPants',
      'D 14:05 GameState.DebugPrintPower() - Player EntityID=17 PlayerID=6 GameAccountId=[hi=1 lo=2]',
      'D 14:05 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=15',
      'D 14:05 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=PLAYER_TECH_LEVEL value=4',
      'D 14:05 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Entrancing Ysera id=112 zone=PLAY zonePos=0 cardId=TB_BaconShop_HERO_53_SKIN_D player=6] CardID=TB_BaconShop_HERO_53_SKIN_D',
      'D 14:05 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Entrancing Ysera id=112 zone=PLAY zonePos=0 cardId=TB_BaconShop_HERO_53_SKIN_D player=6] tag=PLAYER_TECH_LEVEL value=4'
    ]
    for (const line of lines) p.feed(line)
    const match = p.getMatch()
    expect(match.friendlyPlayerId).toBe(6)
    expect(match.turn).toBe(8)
    expect(match.tavernTier).toBe(4)
    expect(match.heroCardId).toBe('TB_BaconShop_HERO_53_SKIN_D')
    expect(match.heroName).toBe('Entrancing Ysera')
  })

  it('does not stick on player 1 when the lobby uses Battlegrounds ids', () => {
    const p = new BattlegroundsParser()
    p.feed('D 12:00 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=4')
    p.feed('D 12:00 GameState.DebugPrintGame() - PlayerID=6, PlayerName=JimJamHey#1968')
    expect(p.getMatch().friendlyPlayerId).toBe(6)
    expect(p.getMatch().turn).toBe(2)
  })

  it('ignores constructed games', () => {
    const p = new BattlegroundsParser()
    p.feed('CREATE_GAME')
    p.feed('GameType=GT_RANKED')
    p.feed('PlayerID=1, PlayerName=Jaren#1')
    expect(p.getMatch().inBattlegrounds).toBe(false)
  })

  it('does not wipe the lobby when combat starts a spectator CREATE_GAME', () => {
    const p = new BattlegroundsParser('JimJamHey')
    const setup = [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=2, PlayerName=MagicPants',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MECH value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=5'
    ]
    for (const line of setup) p.feed(line)
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 12:10 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968')
    p.feed('D 12:10 GameState.DebugPrintGame() - PlayerID=2, PlayerName=MagicPants')
    const match = p.getMatch()
    expect(match.inBattlegrounds).toBe(true)
    expect(match.gameActive).toBe(true)
    expect(match.turn).toBe(3)
    expect(match.availableTribes).toEqual(['Mech'])
    expect(match.lobby.map((row) => row.rawName)).toEqual(['JimJamHey#1968', 'MagicPants'])
    p.feed('D 12:11 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MURLOC value=1')
    expect(p.getMatch().availableTribes).toEqual(['Mech'])
  })

  it('keeps shop turn and tavern tier through a combat CREATE_GAME', () => {
    const p = new BattlegroundsParser('JimJamHey')
    const setup = [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=9',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=3',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_DRAGON value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MECH value=1'
    ]
    for (const line of setup) p.feed(line)
    expect(p.getMatch().turn).toBe(5)
    expect(p.getMatch().rawTurn).toBe(9)
    expect(p.getMatch().tavernTier).toBe(3)
    expect(baconPhaseLabel(p.getMatch().rawTurn, false, p.getMatch().turn)).toBe('Turn 5')
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 12:10 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=1')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=1')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MURLOC value=1')
    const match = p.getMatch()
    expect(match.turn).toBe(5)
    expect(match.rawTurn).toBe(9)
    expect(match.tavernTier).toBe(3)
    expect(match.inCombat).toBe(true)
    expect(baconPhaseLabel(match.rawTurn, match.inCombat, match.turn)).toBe('Combat 4')
    expect(match.availableTribes).toEqual(['Dragon', 'Mech'])
  })

  it('freezes combat boards from PowerTaskList after the spectator CREATE_GAME', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]'
    ]) {
      p.feed(line)
    }
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    const lines = [
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=2',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=3',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=2',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1'
    ]
    let event: string | null = null
    for (const line of lines) {
      const result = p.feed(line)
      if (result.combatEvent) event = result.combatEvent
    }
    expect(event).toBe('start')
    expect(p.getCombat()?.friendly.minions[0]?.attack).toBe(4)
    expect(p.getCombat()?.opponent.minions[0]?.attack).toBe(3)
  })

  it('keeps taunt, divine shield, reborn and golden on last-seen warbands', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=40 CardID=BG_PET_G',
      'D 12:00 GameState.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=ATK value=8',
      'D 12:00 GameState.DebugPrintPower() -     tag=HEALTH value=9',
      'D 12:00 GameState.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=TAUNT value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=DIVINE_SHIELD value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=REBORN value=1',
      'D 12:00 GameState.DebugPrintPower() -     tag=PREMIUM value=1'
    ]) {
      p.feed(line)
    }
    expect(p.getFriendlyBoard()).toEqual([
      {
        cardId: 'BG_PET_G',
        name: '',
        attack: 8,
        health: 9,
        taunt: true,
        divineShield: true,
        reborn: true,
        venomous: false,
        golden: true
      }
    ])
  })

  it('applies shop turn and tavern after the combat game completes', () => {
    const p = new BattlegroundsParser('JimJamHey')
    const setup = [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=9',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=2'
    ]
    for (const line of setup) p.feed(line)
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=1')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE')
    p.feed('D 12:11 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=12')
    p.feed('D 12:11 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=3')
    expect(p.getMatch().gameActive).toBe(true)
    expect(p.getMatch().inCombat).toBe(true)
    expect(p.getMatch().turn).toBe(6)
    expect(p.getMatch().tavernTier).toBe(3)
    p.feed('D 12:12 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0')
    const match = p.getMatch()
    expect(match.gameActive).toBe(true)
    expect(match.inCombat).toBe(false)
    expect(match.turn).toBe(6)
    expect(match.tavernTier).toBe(3)
  })

  it('ignores PowerTaskList duplicates', () => {
    const p = new BattlegroundsParser()
    p.feed('D 12:00 PowerTaskList.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:00 PowerTaskList.DebugPrintGame() - GameType=GT_RANKED')
    expect(p.getMatch().gameActive).toBe(false)
  })

  it('attaches mid-match from Battlegrounds tags without CREATE_GAME', () => {
    const p = new BattlegroundsParser('Jaren')
    p.feed('D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=11')
    p.feed('D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=5')
    const match = p.getMatch()
    expect(match.inBattlegrounds).toBe(true)
    expect(match.gameActive).toBe(true)
    expect(match.turn).toBe(6)
  })

  it('skips placeholder names', () => {
    expect(isPlaceholderName("Bob's Tavern")).toBe(true)
    expect(isPlaceholderName('UNKNOWN HUMAN PLAYER')).toBe(true)
    expect(isPlaceholderName('Prophane#12')).toBe(false)
  })

  it('ends a live match when returning to the Battlegrounds menu', () => {
    const p = new BattlegroundsParser('JimJamHey')
    const lines = [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=15',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=5',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_LEADERBOARD_PLACE value=4'
    ]
    for (const line of lines) p.feed(line)
    expect(p.getMatch().gameActive).toBe(true)
    expect(p.getMatch().tavernTier).toBe(5)
    const completed = p.endLiveMatch()
    expect(p.getMatch().gameActive).toBe(false)
    expect(completed).toEqual({ placement: 4, turn: 8, matchKey: '12:00' })
    expect(p.endLiveMatch()).toBeNull()
  })

  it('labels shop as Turn N and the fight after it as Combat N', () => {
    expect(baconPhaseLabel(0, false)).toBe('Turn 1')
    expect(baconPhaseLabel(1, false)).toBe('Turn 1')
    expect(baconPhaseLabel(2, true)).toBe('Combat 1')
    expect(baconPhaseLabel(3, false)).toBe('Turn 2')
    expect(baconPhaseLabel(8, true)).toBe('Combat 4')
    expect(baconPhaseLabel(9, true, 5)).toBe('Combat 4')
    expect(baconPhaseLabel(9, false, 5)).toBe('Turn 5')
  })

  it('does not append combat snapshot names to the lobby', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=2, PlayerName=MagicPants'
    ]) {
      p.feed(line)
    }
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968')
    p.feed('D 12:10 GameState.DebugPrintGame() - PlayerID=2, PlayerName=Fezziberus#9')
    expect(p.getMatch().lobby.map((row) => row.rawName.replace(/#\d+$/, ''))).toEqual([
      'JimJamHey',
      'MagicPants'
    ])
  })

  it('reads the combat opponent from our pairing, not another table', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=3, PlayerName=Cagey',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=20 PlayerID=7 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=3',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=Cagey tag=BACON_CURRENT_COMBAT_PLAYER_ID value=7',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=rogal88 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=5',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().inCombat).toBe(true)
    expect(p.getMatch().lobby.some((row) => row.rawName === 'Cagey' && row.playerId === 3)).toBe(true)
    p.feed('D 12:00 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0')
    expect(p.getMatch().inCombat).toBe(false)
  })

  it('does not raise tavern from a combat hero clone', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=20 PlayerID=7 GameAccountId=[hi=1 lo=2]',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=PLAYER_TECH_LEVEL value=3',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=528 CardID=BG32_HERO_002',
      'D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=7',
      'D 12:00 GameState.DebugPrintPower() -     tag=PLAYER_ID value=3',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Buttons id=528 zone=SETASIDE zonePos=0 cardId=BG32_HERO_002 player=7] tag=PLAYER_TECH_LEVEL value=6'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().tavernTier).toBe(3)
  })

  it('tracks Nomi player enchantment buffs', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Nomi Player Enchantment id=400 zone=PLAY zonePos=0 cardId=BGS_104e player=7] CardID=BGS_104e',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Nomi Player Enchantment id=400 zone=PLAY zonePos=0 cardId=BGS_104e player=7] tag=ATK value=4',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Nomi Player Enchantment id=400 zone=PLAY zonePos=0 cardId=BGS_104e player=7] tag=HEALTH value=4'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().buffs).toEqual([
      { key: 'shop', label: 'Shop', attack: 4, health: 4, iconCardId: 'BGS_104' }
    ])
  })

  it('tracks every player-wide buff and does not let combat zeros wipe them', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_QUILLBOAR value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_ELEMENTAL_BUFFATKVALUE value=50',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_ELEMENTAL_BUFFHEALTHVALUE value=26',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_BLOODGEMBUFFATKVALUE value=2',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_BLOODGEMBUFFHEALTHVALUE value=2',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=TAVERN_SPELL_ATTACK_INCREASE value=3',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=TAVERN_SPELL_HEALTH_INCREASE value=3',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_PIRATE_BUFFATKVALUE value=4',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_PIRATE_BUFFHEALTHVALUE value=1',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=Rival#1 tag=BACON_ELEMENTAL_BUFFATKVALUE value=8',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Elemental Shop Buff Player Enchantment (DNT) id=400 zone=PLAY zonePos=0 cardId=BG_ShopBuff_Elemental player=7] CardID=BG_ShopBuff_Elemental',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Elemental Shop Buff Player Enchantment (DNT) id=400 zone=PLAY zonePos=0 cardId=BG_ShopBuff_Elemental player=7] tag=TAG_SCRIPT_DATA_NUM_1 value=24',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Elemental Shop Buff Player Enchantment (DNT) id=400 zone=PLAY zonePos=0 cardId=BG_ShopBuff_Elemental player=7] tag=TAG_SCRIPT_DATA_NUM_2 value=24',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Undead Bonus Attack Player Enchant [DNT] id=401 zone=PLAY zonePos=0 cardId=BG25_011pe player=7] CardID=BG25_011pe',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Undead Bonus Attack Player Enchant [DNT] id=401 zone=PLAY zonePos=0 cardId=BG25_011pe player=7] tag=2 value=8',
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Tavern Buffed id=402 zone=PLAY zonePos=0 cardId=BG_ShopBuff_Ench player=7] CardID=BG_ShopBuff_Ench',
      'D 12:00 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Tavern Buffed id=402 zone=PLAY zonePos=0 cardId=BG_ShopBuff_Ench player=7] tag=ATK value=9'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().buffs).toEqual([
      { key: 'gems', label: 'Blood gems', attack: 3, health: 3, iconCardId: 'BG20_GEM' },
      { key: 'elemental', label: 'Elementals', attack: 50, health: 26, iconCardId: 'BGS_115' },
      { key: 'pirate', label: 'Pirates', attack: 4, health: 1, iconCardId: 'BG26_135' },
      { key: 'undead', label: 'Undead', attack: 8, health: 0, iconCardId: 'BG28_300' },
      { key: 'spells', label: 'Spells', attack: 3, health: 3, iconCardId: 'BG28_810' },
      { key: 'shop', label: 'Shop', attack: 24, health: 24, iconCardId: 'BGS_104' }
    ])
    p.feed('D 12:01 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_ELEMENTAL_BUFFATKVALUE value=0')
    p.feed('D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=TAVERN_SPELL_ATTACK_INCREASE value=0')
    expect(p.getMatch().buffs.find((b) => b.key === 'elemental')).toMatchObject({ attack: 50, health: 26 })
    expect(p.getMatch().buffs.find((b) => b.key === 'spells')).toMatchObject({ attack: 3, health: 3 })
  })

  it('starts a live spectate match instead of treating it as combat', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 14:09 GameState.DebugPrintPower() - CREATE_GAME',
      'D 14:09 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 14:09 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 14:09 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 14:09 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=9',
      'D 14:09 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=40 CardID=BG23_HERO_201',
      'D 14:09 GameState.DebugPrintPower() -     tag=PLAYER_ID value=1',
      'D 14:09 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 14:09 GameState.DebugPrintPower() - TAG_CHANGE Entity=[id=2 cardId= type=PLAYER zone=PLAY] tag=PLAYER_TECH_LEVEL value=3'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().heroCardId).toBe('BG23_HERO_201')
    expect(p.getMatch().tavernTier).toBe(3)
    p.feed('D 14:35:38 ================== Begin Spectating 1st player ==================')
    const joined = p.feed('D 14:35:44 GameState.DebugPrintPower() - CREATE_GAME')
    expect(joined.detectedSelfName).toBeNull()
    for (const line of [
      'D 14:35:44 GameState.DebugPrintPower() -     GameEntity EntityID=1',
      'D 14:35:44 GameState.DebugPrintPower() -         tag=TURN value=27',
      'D 14:35:44 GameState.DebugPrintPower() -         tag=BACON_SUBSET_MURLOC value=1',
      'D 14:35:44 GameState.DebugPrintPower() -     Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]',
      'D 14:35:44 GameState.DebugPrintPower() -         tag=PLAYER_ID value=1',
      'D 14:35:44 GameState.DebugPrintPower() -         tag=HERO_ENTITY value=107',
      'D 14:35:44 GameState.DebugPrintPower() -         tag=PLAYER_TECH_LEVEL value=5',
      'D 14:35:44 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=107 CardID=BG33_HERO_001',
      'D 14:35:44 GameState.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 14:35:44 GameState.DebugPrintPower() -     tag=PLAYER_ID value=1',
      'D 14:35:44 GameState.DebugPrintPower() -     tag=ZONE value=PLAY',
      'D 14:35:44 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 14:35:44 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Munky#11189',
      'D 14:35:44 GameState.DebugPrintGame() - PlayerID=9, PlayerName=HiddenPants',
      'D 14:35:44 GameState.DebugPrintPower() -     Player EntityID=3 PlayerID=9 GameAccountId=[hi=0 lo=0]'
    ]) {
      const result = p.feed(line)
      expect(result.detectedSelfName).toBeNull()
    }
    const match = p.getMatch()
    expect(match.spectating).toBe(true)
    expect(match.spectatedName).toBe('Munky')
    expect(match.gameActive).toBe(true)
    expect(match.inCombat).toBe(false)
    expect(match.friendlyPlayerId).toBe(1)
    expect(match.heroCardId).toBe('BG33_HERO_001')
    expect(match.tavernTier).toBe(5)
    expect(match.rawTurn).toBe(27)
    expect(match.turn).toBe(14)
    expect(match.availableTribes).toEqual(['Murloc'])
    expect(match.lobby.some((row) => row.rawName.startsWith('Munky'))).toBe(true)
    expect(match.lobby.some((row) => row.rawName === 'JimJamHey#1968')).toBe(false)
    p.feed('D 14:36 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE')
    expect(p.getMatch().gameActive).toBe(false)
    expect(p.endLiveMatch()).toBeNull()
  })

  it('does not report a spectated BattleTag as the local player', () => {
    const p = new BattlegroundsParser('JimJamHey')
    p.feed('D 14:35 ================== Begin Spectating 1st player ==================')
    p.feed('D 14:35 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 14:35 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 14:35 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Munky#11189')
    p.feed('D 14:35 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]')
    p.feed(
      'D 14:35 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Tide Oracle Morgl id=9 zone=HAND zonePos=1 cardId=BG_FISH player=1] CardID=BG_FISH'
    )
    const result = p.feed(
      'D 14:35 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Tide Oracle Morgl id=9 zone=HAND zonePos=1 cardId=BG_FISH player=1] tag=ZONE value=HAND'
    )
    expect(result.detectedSelfName).toBeNull()
    expect(result.match.spectating).toBe(true)
    expect(result.match.friendlyPlayerId).toBe(1)
  })

  it('still treats a same-lobby CREATE_GAME as combat while spectating', () => {
    const p = new BattlegroundsParser('JimJamHey')
    p.feed('D 14:35 ================== Begin Spectating 1st player ==================')
    for (const line of [
      'D 14:35 GameState.DebugPrintPower() - CREATE_GAME',
      'D 14:35 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 14:35 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Munky#11189',
      'D 14:35 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=11',
      'D 14:35 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_MECH value=1'
    ]) {
      p.feed(line)
    }
    p.feed('D 14:36 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 14:36 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Munky#11189')
    p.feed('D 14:36 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=TURN value=1')
    p.feed('D 14:36 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_NAGA value=1')
    const match = p.getMatch()
    expect(match.spectating).toBe(true)
    expect(match.inCombat).toBe(true)
    expect(match.rawTurn).toBe(11)
    expect(match.availableTribes).toEqual(['Mech'])
    expect(match.lobby.map((row) => row.rawName)).toEqual(['Munky#11189'])
  })

  it('clears spectating when you queue your own game after watching', () => {
    const p = new BattlegroundsParser('JimJamHey')
    p.feed('D 14:35 ================== Begin Spectating 1st player ==================')
    p.feed('D 14:35 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 14:35 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 14:35 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Munky#11189')
    p.feed('D 14:43 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE')
    p.feed('D 14:44 ================== End Spectator Mode ==================')
    p.feed('D 14:45 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 14:45 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 14:45 GameState.DebugPrintGame() - PlayerID=2, PlayerName=JimJamHey#1968')
    p.feed('D 14:45 GameState.DebugPrintPower() - Player EntityID=5 PlayerID=2 GameAccountId=[hi=1 lo=2]')
    p.feed('D 14:46 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=102 CardID=BG34_HERO_000')
    p.feed('D 14:46 GameState.DebugPrintPower() -     tag=PLAYER_ID value=2')
    p.feed('D 14:46 GameState.DebugPrintPower() -     tag=ZONE value=PLAY')
    const match = p.getMatch()
    expect(match.spectating).toBe(false)
    expect(match.spectatedName).toBeNull()
    expect(match.gameActive).toBe(true)
    expect(match.heroCardId).toBe('BG34_HERO_000')
    expect(match.friendlyPlayerId).toBe(2)
  })

  it('does not stay in spectate mode if opponent names arrive before your BattleTag', () => {
    const p = new BattlegroundsParser('JimJamHey')
    p.feed('D 14:45 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 14:45 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 14:45 GameState.DebugPrintGame() - PlayerID=8, PlayerName=Sliva')
    expect(p.getMatch().spectating).toBe(false)
    p.feed('D 14:45 GameState.DebugPrintGame() - PlayerID=2, PlayerName=JimJamHey#1968')
    expect(p.getMatch().spectating).toBe(false)
    expect(p.getMatch().spectatedName).toBeNull()
    expect(p.getMatch().friendlyPlayerId).toBe(2)
  })

  it('does not guess the friendly seat from lobby order when BattleTag is missing', () => {
    const p = new BattlegroundsParser('')
    p.feed('D 12:00 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 12:00 GameState.DebugPrintGame() - PlayerID=8, PlayerName=Sliva')
    p.feed('D 12:00 GameState.DebugPrintGame() - PlayerID=2, PlayerName=HiddenPants')
    expect(p.getMatch().friendlyPlayerId).toBeNull()
  })

  it('clears in-combat from PowerTaskList phase-off (GameState 0 is a false end)', () => {
    const p = new BattlegroundsParser('Jaren')
    p.feed('D 12:00 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS')
    p.feed('D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Jaren#1')
    p.feed('D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1')
    expect(p.getMatch().inCombat).toBe(true)
    p.feed('D 12:02 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0')
    expect(p.getMatch().inCombat).toBe(true)
    p.feed('D 12:03 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=0')
    expect(p.getMatch().inCombat).toBe(false)
  })

  it('fills the lobby from SETASIDE heroes at hero select', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 11:54 GameState.DebugPrintPower() - CREATE_GAME',
      'D 11:54 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 11:54 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 11:54 GameState.DebugPrintGame() - PlayerID=15, PlayerName=FeraMansa',
      'D 11:54 GameState.DebugPrintPower() - Player EntityID=20 PlayerID=7 GameAccountId=[hi=1 lo=2]',
      'D 11:54 GameState.DebugPrintPower() - Player EntityID=21 PlayerID=15 GameAccountId=[hi=0 lo=0]',
      'D 11:54 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=133 CardID=BG28_HERO_801',
      'D 11:54 GameState.DebugPrintPower() -     tag=CONTROLLER value=15',
      'D 11:54 GameState.DebugPrintPower() -     tag=CARDTYPE value=HERO',
      'D 11:54 GameState.DebugPrintPower() -     tag=PLAYER_ID value=2',
      'D 11:54 GameState.DebugPrintPower() -     tag=ZONE value=SETASIDE',
      "D 11:54 PowerTaskList.DebugPrintPower() -     FULL_ENTITY - Updating [entityName=Doctor Holli'dae id=133 zone=SETASIDE zonePos=0 cardId=BG28_HERO_801 player=15] CardID=BG28_HERO_801",
      'D 11:54 PowerTaskList.DebugPrintPower() -         tag=PLAYER_ID value=2'
    ]) {
      p.feed(line)
    }
    const row = p.getMatch().lobby.find((player) => player.playerId === 2)
    expect(row?.heroCardId).toBe('BG28_HERO_801')
    expect(row?.heroName).toBe("Doctor Holli'dae")
  })

  it('reads lobby tribes from shop minion subset tags', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 11:55 GameState.DebugPrintPower() - CREATE_GAME',
      'D 11:55 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 11:55 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 11:55 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=303 CardID=BG36_921',
      'D 11:55 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 11:55 GameState.DebugPrintPower() -     tag=CARDRACE value=NAGA',
      'D 11:55 GameState.DebugPrintPower() -     tag=BACON_SUBSET_NAGA value=1',
      'D 11:55 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=536 CardID=BG31_330',
      'D 11:55 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 11:55 GameState.DebugPrintPower() -     tag=BACON_SUBSET_DEMON value=1',
      'D 11:55 GameState.DebugPrintPower() -     tag=BACON_SUBSET_NAGA value=0'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().availableTribes).toEqual(['Demon', 'Naga'])
    expect(p.getMatch().tribesComplete).toBe(false)
  })

  it('does not add lobby tribes from a minion CARDRACE tag', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 11:55 GameState.DebugPrintPower() - CREATE_GAME',
      'D 11:55 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 11:55 GameState.DebugPrintGame() - PlayerID=7, PlayerName=JimJamHey#1968',
      'D 11:55 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_BEAST value=1',
      'D 11:55 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_SUBSET_NAGA value=1',
      'D 11:55 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=40 CardID=BG_MECH',
      'D 11:55 GameState.DebugPrintPower() -     tag=CARDTYPE value=MINION',
      'D 11:55 GameState.DebugPrintPower() -     tag=CARDRACE value=MECHANICAL'
    ]) {
      p.feed(line)
    }
    expect(p.getMatch().availableTribes).toEqual(['Beast', 'Naga'])
  })

  it('keeps the named combat opponent when GameEntity uses a clone player id', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=8, PlayerName=Sliva',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]'
    ]) {
      p.feed(line)
    }
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_CURRENT_COMBAT_PLAYER_ID value=18')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=8')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=Sliva tag=BACON_CURRENT_COMBAT_PLAYER_ID value=1')
    const lines = [
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=18',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=3',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=2',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1'
    ]
    for (const line of lines) p.feed(line)
    expect(p.getMatch().lobby.some((row) => row.rawName === 'Sliva' && row.playerId === 8)).toBe(true)
    expect(p.getCombat()?.opponent.name).toBe('Sliva')
    expect(p.getCombat()?.opponent.playerId).toBe(8)
    expect(p.getCombat()?.opponent.minions[0]?.attack).toBe(3)
  })

  it('does not treat a hero name as the combat opponent BattleTag', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=1, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=8, PlayerName=Lipman#9',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=1 GameAccountId=[hi=1 lo=2]'
    ]) {
      p.feed(line)
    }
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=8')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=Lady Deathwhisper tag=BACON_CURRENT_COMBAT_PLAYER_ID value=1')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=Lady Vashj tag=BACON_CURRENT_COMBAT_PLAYER_ID value=8')
    const lines = [
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=8',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=3',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=2',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1'
    ]
    for (const line of lines) p.feed(line)
    expect(p.getMatch().lobby.find((row) => row.playerId === 8)?.rawName).toBe('Lipman#9')
    expect(p.getCombat()?.opponent.name).toBe('Lipman')
    expect(p.getCombat()?.opponent.playerId).toBe(8)
  })

  it('ignores other tables when naming the combat opponent', () => {
    const p = new BattlegroundsParser('JimJamHey')
    for (const line of [
      'D 12:00 GameState.DebugPrintPower() - CREATE_GAME',
      'D 12:00 GameState.DebugPrintGame() - GameType=GT_BATTLEGROUNDS',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=4, PlayerName=JimJamHey#1968',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=8, PlayerName=FlyingWeasel',
      'D 12:00 GameState.DebugPrintGame() - PlayerID=6, PlayerName=rogal88',
      'D 12:00 GameState.DebugPrintPower() - Player EntityID=2 PlayerID=4 GameAccountId=[hi=1 lo=2]'
    ]) {
      p.feed(line)
    }
    p.feed('D 12:10 GameState.DebugPrintPower() - CREATE_GAME')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=JimJamHey#1968 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=8')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=FlyingWeasel tag=BACON_CURRENT_COMBAT_PLAYER_ID value=4')
    p.feed('D 12:10 GameState.DebugPrintPower() - TAG_CHANGE Entity=rogal88 tag=BACON_CURRENT_COMBAT_PLAYER_ID value=6')
    const lines = [
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BGS_PET',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - FULL_ENTITY - Creating ID=20 CardID=BGS_OPP',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CARDTYPE value=4',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=CONTROLLER value=8',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ATK value=3',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=HEALTH value=2',
      'D 12:10 PowerTaskList.DebugPrintPower() -     tag=ZONE_POSITION value=1',
      'D 12:10 PowerTaskList.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=BACON_IN_COMBAT_PHASE value=1'
    ]
    for (const line of lines) p.feed(line)
    expect(p.getCombat()?.opponent.name).toBe('FlyingWeasel')
    expect(p.getCombat()?.opponent.playerId).toBe(8)
  })
})

describe('spectator catchup', () => {
  it('does not skip a Begin Spectating CREATE_GAME', () => {
    expect(
      isCombatSpectatorCreateGame(
        '================== Begin Spectating 1st player ==================\nGameState.DebugPrintPower() - CREATE_GAME'
      )
    ).toBe(false)
    expect(isCombatSpectatorCreateGame('End Spectator Mode near a combat CREATE_GAME')).toBe(false)
    expect(isCombatSpectatorCreateGame('plain CREATE_GAME with no extra markers')).toBe(false)
  })
})

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
    expect(urls[0]).toContain('/bgs/latest/enUS/512x/BG33_140_G.png')
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

describe('session', () => {
  it('averages today’s finishes and keeps a rolling last 10', () => {
    const day = new Date('2026-08-25T12:00:00')
    let s = emptySession(day)
    s = recordFinish(s, { endedAt: '2026-08-25T12:00:00', placement: 1, turn: 10 }, day)
    s = recordFinish(s, { endedAt: '2026-08-25T13:00:00', placement: 4, turn: 8 }, day)
    expect(averageFinish(s, day)).toBe(2.5)
    for (let i = 0; i < 10; i++) {
      s = recordFinish(s, { endedAt: `2026-08-25T14:0${i}:00`, placement: 8, turn: 4 }, day)
    }
    expect(s.games).toHaveLength(10)
    expect(s.games[0]?.placement).toBe(8)
  })

  it('starts a fresh session at midnight', () => {
    const monday = new Date('2026-08-25T22:00:00')
    const tuesday = new Date('2026-08-26T08:00:00')
    let s = recordFinish(
      emptySession(monday),
      { endedAt: '2026-08-25T22:00:00', placement: 2, turn: 12, mmrBefore: 5200 },
      monday
    )
    s = { ...s, startMmr: 5200 }
    s = ensureToday(s, tuesday)
    expect(s.date).toBe('2026-08-26')
    expect(s.games).toEqual([])
    expect(s.startMmr).toBeNull()
    expect(averageFinish(s, tuesday)).toBeNull()
  })

  it('fills MMR delta once the Play-screen rating moves', () => {
    const day = new Date('2026-08-25T12:00:00')
    let s = recordFinish(
      emptySession(day),
      { endedAt: '2026-08-25T12:00:00', placement: 2, turn: 12, mmrBefore: 5200 },
      day
    )
    expect(applyGameMmr(s, 5200)).toBe(s)
    s = applyGameMmr(s, 5244)
    expect(s.games[0]?.mmrDelta).toBe(44)
    expect(s.games[0]?.mmrAfter).toBe(5244)
    expect(s.games[0]?.mmrEstimated).toBe(false)
    s = applyRatingObservation(
      recordFinish(emptySession(day), { endedAt: '2026-08-25T12:00:00', placement: 4, turn: 10, mmrBefore: 5200 }, day),
      { rating: 5200, delta: null },
      { settled: true }
    )
    expect(s.games[0]?.mmrAfter).toBe(5200)
    expect(s.games[0]?.mmrDelta).toBe(0)
    s = applyRatingObservation(
      recordFinish(emptySession(day), { endedAt: '2026-08-25T12:00:00', placement: 2, turn: 12, mmrBefore: 5200 }, day),
      { rating: null, delta: 44 }
    )
    expect(s.games[0]?.mmrAfter).toBe(5244)
    expect(s.games[0]?.mmrDelta).toBe(44)
  })

  it('does not copy the session Today total onto the last game', () => {
    const day = new Date('2026-08-26T22:00:00')
    let s = recordFinish(
      { date: '2026-08-26', games: [], startMmr: 5216 },
      { endedAt: '2026-08-26T22:16:27.654Z', placement: 2, turn: 15, heroName: "Al'Akir", mmrBefore: 5073 },
      day
    )
    s = applyRatingObservation(s, { rating: null, delta: -143 })
    expect(s.games[0]?.mmrDelta).toBeNull()
    s = applyRatingObservation(
      { ...s, games: [{ ...s.games[0], mmrAfter: 4930, mmrDelta: -143 }] },
      { rating: 5146, delta: 73 }
    )
    expect(s.games[0]?.mmrAfter).toBe(5146)
    expect(s.games[0]?.mmrDelta).toBe(73)
  })

  it('replaces a junk last-game delta with the results-screen Rating pair', () => {
    const day = new Date('2026-08-26T22:00:00')
    let s = recordFinish(
      { date: '2026-08-26', games: [], startMmr: 5216 },
      { endedAt: '2026-08-26T22:57:47.072Z', placement: 1, turn: 17, heroName: 'A. F. Kay', mmrBefore: 5147 },
      day
    )
    s = applyRatingObservation(s, { rating: null, delta: -36 })
    expect(s.games[0]?.mmrDelta).toBeNull()
    s = applyRatingObservation(s, { rating: 5111, delta: -36 })
    expect(s.games[0]?.mmrAfter).toBeNull()
    s = {
      ...s,
      games: [{ ...s.games[0], mmrAfter: 5111, mmrDelta: -36 }]
    }
    expect(gameMmrIsSettled(s.games[0])).toBe(false)
    s = applyRatingObservation(s, { rating: 5248, delta: 101 })
    expect(s.games[0]?.mmrAfter).toBe(5248)
    expect(s.games[0]?.mmrDelta).toBe(101)
    expect(gameMmrIsSettled(s.games[0])).toBe(true)
  })

  it('does not invent MMR from placement, and collapses restart duplicates', () => {
    const day = new Date('2026-08-26T12:00:00')
    let s = recordFinish(
      emptySession(day),
      { endedAt: '2026-08-26T17:09:32.172Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrEstimated: true, mmrDelta: 71 },
      day
    )
    expect(s.games[0]?.mmrDelta).toBeNull()
    s = recordFinish(
      s,
      { endedAt: '2026-08-26T17:20:54.627Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrEstimated: true, mmrDelta: 71 },
      day
    )
    expect(s.games).toHaveLength(1)
    s = bindCurrentMmr(s, 5205, day)
    expect(s.games[0]?.mmrAfter).toBe(5205)
    expect(s.games[0]?.mmrDelta).toBeNull()
    expect(s.startMmr).toBe(5205)
    expect(
      bindCurrentMmr(
        { date: '2026-08-30', games: [], startMmr: 8210 },
        5412,
        new Date('2026-08-30T12:00:00')
      ).startMmr
    ).toBe(5412)
    expect(
      bindCurrentMmr(
        {
          date: '2026-08-30',
          games: [
            {
              endedAt: '2026-08-30T12:00:00.000Z',
              placement: 4,
              turn: 10,
              mmrBefore: 5412,
              mmrAfter: 5380,
              mmrDelta: -32
            }
          ],
          startMmr: 8210
        },
        5380,
        new Date('2026-08-30T18:00:00')
      ).startMmr
    ).toBe(5412)
    expect(
      dedupeGames([
        { endedAt: '2026-08-26T17:09:32.172Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrDelta: 71, mmrEstimated: true },
        { endedAt: '2026-08-26T17:20:54.627Z', placement: 2, turn: 16, heroName: "Y'Shaarj", mmrDelta: 71, mmrEstimated: true }
      ])
    ).toHaveLength(1)
    expect(
      dedupeGames([
        { endedAt: '2026-08-26T17:09:32.172Z', placement: 4, turn: 10, matchKey: '12:00' },
        { endedAt: '2026-08-26T17:10:01.000Z', placement: 4, turn: 10 }
      ])
    ).toHaveLength(1)
    expect(
      dedupeGames([
        { endedAt: '2026-08-26T18:00:00.000Z', placement: 8, turn: 12, matchKey: '13:00', heroName: 'George' },
        { endedAt: '2026-08-26T18:00:20.000Z', placement: 2, turn: 12, matchKey: '13:00', heroName: 'George' }
      ])[0]?.placement
    ).toBe(2)
  })
})

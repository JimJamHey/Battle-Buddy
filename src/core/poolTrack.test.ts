import { describe, expect, it } from 'vitest'
import { PoolTracker } from './poolTrack'
import type { BgMinion } from './types'

function card(id: string, techLevel = 1): BgMinion {
  return {
    id,
    dbfId: 1,
    name: id,
    text: '',
    attack: 1,
    health: 1,
    techLevel,
    tribes: ['Mech'],
    tileUrl: '',
    goldenId: `${id}_G`,
    kind: 'minion',
    cost: 0,
    mechanics: []
  }
}

describe('pool remaining copies', () => {
  it('does not consume the shop until a minion is bought into hand', () => {
    const t = new PoolTracker()
    t.setCatalog([card('BG_MECH')])
    t.feed('D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=10 CardID=BG_MECH', false)
    t.feed('D 12:00 GameState.DebugPrintPower() -     tag=ZONE value=1', false)
    t.feed('D 12:00 GameState.DebugPrintPower() -     tag=CONTROLLER value=2', false)
    expect(t.remainingFor('BG_MECH')).toBe(15)
    t.feed(
      'D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Gear id=10 zone=PLAY zonePos=1 cardId=BG_MECH player=2] tag=ZONE value=HAND',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
  })

  it('returns a copy when the bought minion is sold during shop', () => {
    const t = new PoolTracker()
    t.setCatalog([card('BG_MECH')])
    t.feed(
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Gear id=10 zone=HAND zonePos=1 cardId=BG_MECH player=2] CardID=BG_MECH',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
    t.feed(
      'D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Gear id=10 zone=HAND zonePos=1 cardId=BG_MECH player=2] tag=ZONE value=SETASIDE',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(15)
  })

  it('counts an opponent warband seen in combat and ignores combat clones', () => {
    const t = new PoolTracker()
    t.setCatalog([card('BG_MECH')])
    t.feed(
      'D 12:10 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Gear id=20 zone=PLAY zonePos=1 cardId=BG_MECH player=4] CardID=BG_MECH',
      true
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
    t.feed('D 12:10 GameState.DebugPrintPower() - FULL_ENTITY - Creating ID=99 CardID=BG_MECH', true)
    t.feed('D 12:10 GameState.DebugPrintPower() -     tag=ZONE value=PLAY', true)
    t.feed('D 12:10 GameState.DebugPrintPower() -     tag=CONTROLLER value=4', true)
    expect(t.remainingFor('BG_MECH')).toBe(14)
  })

  it('keeps a copy taken after the bought minion is played to the shop board', () => {
    const t = new PoolTracker()
    t.setCatalog([card('BG_MECH')])
    t.feed(
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Gear id=10 zone=HAND zonePos=1 cardId=BG_MECH player=2] CardID=BG_MECH',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
    t.feed(
      'D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Gear id=10 zone=HAND zonePos=1 cardId=BG_MECH player=2] tag=ZONE value=PLAY',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
  })

  it('does not return a copy when a combat minion dies or combat ends', () => {
    const t = new PoolTracker()
    t.setCatalog([card('BG_MECH')])
    t.feed(
      'D 12:10 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Gear id=20 zone=PLAY zonePos=1 cardId=BG_MECH player=4] CardID=BG_MECH',
      true
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
    t.feed(
      'D 12:11 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Gear id=20 zone=PLAY zonePos=1 cardId=BG_MECH player=4] tag=ZONE value=GRAVEYARD',
      true
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
    t.feed(
      'D 12:12 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Gear id=20 zone=GRAVEYARD zonePos=1 cardId=BG_MECH player=4] tag=ZONE value=PLAY',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
  })

  it('resets remaining counts on a shop CREATE_GAME even with leftover entities', () => {
    const t = new PoolTracker()
    t.setCatalog([card('BG_MECH')])
    t.feed(
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Gear id=10 zone=HAND zonePos=1 cardId=BG_MECH player=2] CardID=BG_MECH',
      false
    )
    expect(t.remainingFor('BG_MECH')).toBe(14)
    t.feed('D 12:30 GameState.DebugPrintPower() - CREATE_GAME', false)
    expect(t.remainingFor('BG_MECH')).toBe(15)
  })

  it('does not return a tavern spell copy after it is cast', () => {
    const t = new PoolTracker()
    t.setCatalog([
      {
        ...card('BG_SPELL'),
        kind: 'spell',
        tribes: [],
        cost: 1
      }
    ])
    t.feed(
      'D 12:00 GameState.DebugPrintPower() - FULL_ENTITY - Updating [entityName=Coin id=10 zone=HAND zonePos=1 cardId=BG_SPELL player=2] CardID=BG_SPELL',
      false
    )
    expect(t.remainingFor('BG_SPELL')).toBe(4)
    t.feed(
      'D 12:01 GameState.DebugPrintPower() - TAG_CHANGE Entity=[entityName=Coin id=10 zone=HAND zonePos=1 cardId=BG_SPELL player=2] tag=ZONE value=SETASIDE',
      false
    )
    expect(t.remainingFor('BG_SPELL')).toBe(4)
  })
})

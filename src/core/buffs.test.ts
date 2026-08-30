import { describe, expect, it } from 'vitest'
import { classifyPlayerBuff, formatBuffValue, mergeBuffs, playerTagBuff } from './buffs'

describe('classifyPlayerBuff', () => {
  it('maps shop, gem, and undead player enchantments and ignores per-minion tavern buffs', () => {
    expect(classifyPlayerBuff('BG_ShopBuff_Elemental', 'Elemental Shop Buff Player Enchantment (DNT)')).toEqual({
      key: 'shop',
      label: 'Shop',
      iconCardId: 'BGS_104'
    })
    expect(classifyPlayerBuff('BGS_104e', 'Nomi Player Enchantment')).toMatchObject({ key: 'shop' })
    expect(classifyPlayerBuff('BG_ShopBuff', 'Shop Buff Player Enchant (DNT)')).toMatchObject({ key: 'shop' })
    expect(classifyPlayerBuff('BG26_159pe', 'Blood Gem Player Enchant (DNT)')).toMatchObject({ key: 'gems' })
    expect(classifyPlayerBuff('BG25_011pe', 'Undead Bonus Attack Player Enchant [DNT]')).toMatchObject({
      key: 'undead'
    })
    expect(classifyPlayerBuff('BG_ShopBuff_Ench', 'Tavern Buffed')).toBeNull()
    expect(classifyPlayerBuff('BG20_GEMe', 'Blood Gem')).toBeNull()
    expect(classifyPlayerBuff('BG20_GEM', 'Blood Gem')).toBeNull()
    expect(classifyPlayerBuff('TB_BaconShop_8P_PlayerE', 'BaconShop8PlayerEnchant')).toBeNull()
  })
})

describe('playerTagBuff', () => {
  it('adds the base 1/1 onto blood-gem extras and hides empty non-gem tags', () => {
    expect(playerTagBuff('gems', 2, 2)).toMatchObject({ attack: 3, health: 3 })
    expect(playerTagBuff('gems', 0, 0, { quilboarInLobby: true })).toMatchObject({ attack: 1, health: 1 })
    expect(playerTagBuff('gems', 0, 0)).toBeNull()
    expect(playerTagBuff('elemental', 50, 26)).toMatchObject({ attack: 50, health: 26, iconCardId: 'BGS_115' })
    expect(playerTagBuff('spells', 3, 3)).toMatchObject({ key: 'spells', attack: 3, health: 3 })
    expect(playerTagBuff('elemental', 0, 0)).toBeNull()
  })
})

describe('mergeBuffs / formatBuffValue', () => {
  it('keeps shop and elemental separate and formats attack-only undead', () => {
    expect(
      mergeBuffs([
        { key: 'shop', label: 'Shop', attack: 24, health: 24, iconCardId: 'BGS_104' },
        { key: 'elemental', label: 'Elementals', attack: 50, health: 26, iconCardId: 'BGS_115' },
        { key: 'undead', label: 'Undead', attack: 8, health: 0, iconCardId: 'BG28_300' }
      ])
    ).toEqual([
      { key: 'elemental', label: 'Elementals', attack: 50, health: 26, iconCardId: 'BGS_115' },
      { key: 'undead', label: 'Undead', attack: 8, health: 0, iconCardId: 'BG28_300' },
      { key: 'shop', label: 'Shop', attack: 24, health: 24, iconCardId: 'BGS_104' }
    ])
    expect(formatBuffValue({ key: 'elemental', label: 'Elementals', attack: 50, health: 26, iconCardId: 'x' })).toBe(
      '+50 / +26'
    )
    expect(formatBuffValue({ key: 'undead', label: 'Undead', attack: 8, health: 0, iconCardId: 'x' })).toBe('+8 / +0')
  })

  it('lets a later same-key reading replace an earlier one instead of summing', () => {
    expect(
      mergeBuffs([
        { key: 'gems', label: 'Blood gems', attack: 3, health: 3, iconCardId: 'BG20_GEM' },
        { key: 'gems', label: 'Blood gems', attack: 5, health: 4, iconCardId: 'BG20_GEM' }
      ])
    ).toEqual([{ key: 'gems', label: 'Blood gems', attack: 5, health: 4, iconCardId: 'BG20_GEM' }])
  })
})

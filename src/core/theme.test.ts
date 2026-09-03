import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isThemeId, resolveTheme } from './theme'

describe('themes', () => {
  it('resolves the five shipped themes', () => {
    expect(resolveTheme('hearth')).toBe('hearth')
    expect(resolveTheme('crown')).toBe('crown')
    expect(resolveTheme('coliseum')).toBe('coliseum')
    expect(resolveTheme('warband')).toBe('warband')
    expect(resolveTheme('voidreach')).toBe('voidreach')
  })

  it('maps legacy IDs to the nearest new theme', () => {
    expect(resolveTheme('classic')).toBe('hearth')
    expect(resolveTheme('ember')).toBe('hearth')
    expect(resolveTheme('grove')).toBe('hearth')
    expect(resolveTheme('arcane')).toBe('hearth')
    expect(resolveTheme('buddy')).toBe('crown')
    expect(resolveTheme('cthulhu')).toBe('voidreach')
    expect(resolveTheme('tide')).toBe('voidreach')
    expect(resolveTheme('nope')).toBe(DEFAULT_THEME)
  })

  it('type-guards correctly', () => {
    expect(isThemeId('hearth')).toBe(true)
    expect(isThemeId('ember')).toBe(false)
    expect(isThemeId('buddy')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isThemeId, resolveTheme } from './theme'

describe('themes', () => {
  it('maps the old launcher palettes onto the shipped themes', () => {
    expect(resolveTheme('classic')).toBe('classic')
    expect(resolveTheme('cthulhu')).toBe('cthulhu')
    expect(resolveTheme('buddy')).toBe('buddy')
    expect(resolveTheme('ember')).toBe('classic')
    expect(resolveTheme('grove')).toBe('classic')
    expect(resolveTheme('arcane')).toBe('classic')
    expect(resolveTheme('tide')).toBe('cthulhu')
    expect(resolveTheme('nope')).toBe(DEFAULT_THEME)
    expect(isThemeId('ember')).toBe(false)
    expect(isThemeId('buddy')).toBe(true)
  })
})

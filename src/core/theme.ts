export const THEMES = [
  { id: 'ember', name: 'Ember', hint: 'Gold tavern light' },
  { id: 'tide', name: 'Tide', hint: 'Deep sea blue' },
  { id: 'arcane', name: 'Arcane', hint: 'Violet spellwork' },
  { id: 'grove', name: 'Grove', hint: 'Moss and amber' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'ember'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export const THEMES = [
  { id: 'classic', name: 'Classic' },
  { id: 'cthulhu', name: 'Cthulhu' },
  { id: 'buddy', name: 'Battle Buddy' }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'buddy'

const LEGACY_THEMES: Record<string, ThemeId> = {
  ember: 'classic',
  grove: 'classic',
  arcane: 'classic',
  tide: 'cthulhu'
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function resolveTheme(value: unknown): ThemeId {
  if (isThemeId(value)) return value
  if (typeof value === 'string' && value in LEGACY_THEMES) return LEGACY_THEMES[value]
  return DEFAULT_THEME
}

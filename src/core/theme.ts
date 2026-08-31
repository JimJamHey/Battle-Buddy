export const THEMES = [
  { id: 'classic', name: 'Classic', hint: 'Oak, parchment, lantern gold' },
  { id: 'cthulhu', name: 'Cthulhu', hint: 'Abyss teal, violet, bioluminescence' },
  { id: 'buddy', name: 'Battle Buddy', hint: 'Navy coin-rim, ember, mint' }
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

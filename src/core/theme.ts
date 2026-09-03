export const THEMES = [
  { id: 'hearth',    name: 'Tavern Hearth' },
  { id: 'crown',     name: "Titan's Crown"  },
  { id: 'coliseum',  name: 'Tribe Coliseum' },
  { id: 'warband',   name: 'Warband Front'  },
  { id: 'voidreach', name: 'Void Reach'     },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'hearth'

/** Old IDs from the launcher and persisted settings — map gracefully. */
const LEGACY_THEMES: Record<string, ThemeId> = {
  classic: 'hearth',
  ember:   'hearth',
  grove:   'hearth',
  arcane:  'hearth',
  buddy:   'crown',
  cthulhu: 'voidreach',
  tide:    'voidreach',
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

export function resolveTheme(value: unknown): ThemeId {
  if (isThemeId(value)) return value
  if (typeof value === 'string' && value in LEGACY_THEMES) return LEGACY_THEMES[value]
  return DEFAULT_THEME
}

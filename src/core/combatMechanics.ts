/** Central combat keyword / trigger / gap registry for the sim and coverage reports. */

export const COMBAT_TRIGGERS = [
  'deathrattle',
  'rally',
  'startOfCombat',
  'avenge',
  'afterKill',
  'onSummon'
] as const

export type CombatTriggerName = (typeof COMBAT_TRIGGERS)[number]

export type CombatKeywordSimKey =
  | 'divineShield'
  | 'taunt'
  | 'reborn'
  | 'venomous'
  | 'poisonous'
  | 'windfury'
  | 'stealth'

export const COMBAT_KEYWORDS: Record<
  CombatKeywordSimKey,
  { logTags: string[]; patterns: RegExp[] }
> = {
  divineShield: { logTags: ['DIVINE_SHIELD'], patterns: [/divine shield/i] },
  taunt: { logTags: ['TAUNT'], patterns: [/\btaunt\b/i] },
  reborn: { logTags: ['REBORN'], patterns: [/\breborn\b/i] },
  venomous: { logTags: ['VENOMOUS'], patterns: [/\bvenomous\b/i] },
  poisonous: { logTags: ['POISONOUS'], patterns: [/\bpoisonous\b/i] },
  windfury: { logTags: ['WINDFURY'], patterns: [/\bwindfury\b/i] },
  stealth: { logTags: ['STEALTH'], patterns: [/\bstealth\b/i] }
}

/**
 * Mechanics that cannot be modeled in the combat sim.
 *
 * Deliberately excluded (these look like combat text but only fire in the shop phase):
 *   - Magnetic         — merges at play time; merged stats are already in m.attack/health
 *   - Spellcraft       — creates a paired spell in the Tavern; buffs expire before combat
 *   - Activate         — costs gold during the shopping phase; never fires in combat
 *   - End of Turn      — fires at end of the shopping turn, not during combat
 *   - "This game"      — accumulates during the shopping phase; stats already baked into m.attack/health
 *
 * Remaining unsupported patterns below cause a genuine gap in the combat sim.
 */
export const UNSUPPORTED_COMBAT_MECHANICS = [
  'Frenzy',
  'Copy Deathrattle',
] as const

export const UNSUPPORTED_COMBAT_PATTERNS: [RegExp, (typeof UNSUPPORTED_COMBAT_MECHANICS)[number]][] = [
  [/\bfrenzy\b/i, 'Frenzy'],
  [/copy.{0,40}deathrattle|gains?.{0,24}(?:a copy of |the )?deathrattle/i, 'Copy Deathrattle'],
]

export function keywordsFromText(blob: string): CombatKeywordSimKey[] {
  const found: CombatKeywordSimKey[] = []
  for (const [key, row] of Object.entries(COMBAT_KEYWORDS) as [CombatKeywordSimKey, (typeof COMBAT_KEYWORDS)[CombatKeywordSimKey]][]) {
    if (row.patterns.some((pattern) => pattern.test(blob))) found.push(key)
  }
  return found
}

export function unsupportedMechanicsInText(blob: string, combatTriggerBlob = ''): string[] {
  const gaps: string[] = []
  const combined = `${blob} ${combatTriggerBlob}`
  for (const [pattern, label] of UNSUPPORTED_COMBAT_PATTERNS) {
    if (pattern.test(combined)) gaps.push(label)
  }
  return [...new Set(gaps)]
}

/** Card text that can affect combat resolution. */
export function cardTextIsCombatRelevant(text: string, mechanics: string[] = []): boolean {
  const raw = text.replace(/<[^>]+>/g, ' ').replace(/\[x\]/gi, ' ')
  // Exclude pure shop-phase cards from being considered "combat relevant" for coverage.
  // These patterns only fire in the shop phase and never during combat resolution.
  const shopOnly = /\bactivate\s*\(/i.test(raw) || /spellcraft\s*:/i.test(raw)
  if (shopOnly && !/deathrattle|rally|avenge|start of combat/i.test(raw)) return false
  const blob = `${raw} ${mechanics.join(' ')}`
  if (/\b(?:deathrattle|rally|avenge|start of combat)\b/i.test(blob)) return true
  if (/during combat/i.test(blob)) return true
  if (/whenever this attacks/i.test(blob)) return true
  if (/\b(?:divine shield|reborn|venomous|poisonous|windfury|cleave|taunt)\b/i.test(blob)) return true
  if (/summon/i.test(blob) && /combat|deathrattle|rally|avenge|start of combat/i.test(blob)) return true
  return mechanics.some((tag) =>
    /deathrattle|rally|avenge|start of combat|divine shield|reborn|venomous|poisonous|windfury|cleave|taunt/i.test(tag)
  )
}

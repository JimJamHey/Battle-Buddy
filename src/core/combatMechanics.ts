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

/** Mechanics the text parser does not model — boards with these show Partial. */
export const UNSUPPORTED_COMBAT_MECHANICS = [
  'Frenzy',
  'Magnetic',
  'Spellcraft',
  'Activate',
  'End of Turn',
  'Copy Deathrattle',
  'This game',
  'Scaled'
] as const

export const UNSUPPORTED_COMBAT_PATTERNS: [RegExp, (typeof UNSUPPORTED_COMBAT_MECHANICS)[number]][] = [
  [/\bfrenzy\b/i, 'Frenzy'],
  [/\bmagnetic\b/i, 'Magnetic'],
  [/\bspellcraft\b/i, 'Spellcraft'],
  [/\bactivate\b/i, 'Activate'],
  [/end of (?:your )?turn/i, 'End of Turn'],
  [/copy.{0,40}deathrattle|gains?.{0,24}(?:a copy of |the )?deathrattle/i, 'Copy Deathrattle'],
  [/\bthis game\b/i, 'This game'],
  [/\bfor each\b/i, 'Scaled']
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
    const onTrigger = label === 'This game' || label === 'Scaled'
    if (pattern.test(onTrigger ? combatTriggerBlob : combined)) gaps.push(label)
  }
  return [...new Set(gaps)]
}

/** Card text that can affect combat resolution. */
export function cardTextIsCombatRelevant(text: string, mechanics: string[] = []): boolean {
  const raw = text.replace(/<[^>]+>/g, ' ').replace(/\[x\]/gi, ' ')
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

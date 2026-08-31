export const MECHANIC_ORDER = [
  'Taunt',
  'Deathrattle',
  'Battlecry',
  'Divine Shield',
  'Reborn',
  'Rally',
  'Avenge',
  'Frenzy',
  'Magnetic',
  'Venomous',
  'Poisonous',
  'Windfury',
  'Cleave',
  'Spellcraft',
  'Discover',
  'Choose One',
  'Activate',
  'Lockbox',
  'Start of Combat',
  'End of Turn',
  'Aura',
  'Stealth'
] as const

export type MechanicName = (typeof MECHANIC_ORDER)[number]

const TAG_TO_MECHANIC: Record<string, MechanicName> = {
  TAUNT: 'Taunt',
  DEATHRATTLE: 'Deathrattle',
  BATTLECRY: 'Battlecry',
  DIVINE_SHIELD: 'Divine Shield',
  REBORN: 'Reborn',
  RALLY: 'Rally',
  BACON_RALLY: 'Rally',
  AVENGE: 'Avenge',
  FRENZY: 'Frenzy',
  MAGNETIC: 'Magnetic',
  VENOMOUS: 'Venomous',
  POISONOUS: 'Poisonous',
  WINDFURY: 'Windfury',
  SPELLCRAFT: 'Spellcraft',
  BACON_SPELLCRAFT_ID: 'Spellcraft',
  DISCOVER: 'Discover',
  CHOOSE_ONE: 'Choose One',
  CHOOSEONE: 'Choose One',
  AURA: 'Aura',
  STEALTH: 'Stealth',
  CLEAVE: 'Cleave',
  START_OF_COMBAT: 'Start of Combat',
  END_OF_TURN_TRIGGER: 'End of Turn',
  BACON_LOCK: 'Lockbox',
  BACON_LOCKBOX: 'Lockbox',
  LOCKBOX: 'Lockbox',
  BACON_ACTIVATE: 'Activate',
  ACTIVATE: 'Activate'
}

const TEXT_MECHANICS: [RegExp, MechanicName][] = [
  [/\brally\b/i, 'Rally'],
  [/\bavenge\b/i, 'Avenge'],
  [/\bfrenzy\b/i, 'Frenzy'],
  [/\bspellcraft\b/i, 'Spellcraft'],
  [/start of combat/i, 'Start of Combat'],
  [/end of (?:your )?turn/i, 'End of Turn'],
  [/\btaunt\b/i, 'Taunt'],
  [/\bdeathrattle\b/i, 'Deathrattle'],
  [/\bbattlecry\b/i, 'Battlecry'],
  [/divine shield/i, 'Divine Shield'],
  [/\breborn\b/i, 'Reborn'],
  [/\bvenomous\b/i, 'Venomous'],
  [/\bpoisonous\b/i, 'Poisonous'],
  [/\bwindfury\b/i, 'Windfury'],
  [/\bmagnetic\b/i, 'Magnetic'],
  [/\bcleave\b/i, 'Cleave'],
  [/\bdiscover\b/i, 'Discover'],
  [/\bchoose one\b/i, 'Choose One'],
  [/\bactivate\b/i, 'Activate'],
  [/\blockbox\b/i, 'Lockbox']
]

export function mechanicsFromCard(tags: string[] | undefined, text: string | undefined): string[] {
  const found = new Set<string>()
  for (const tag of tags ?? []) {
    const name = TAG_TO_MECHANIC[tag.toUpperCase()]
    if (name && MECHANIC_ORDER.includes(name)) found.add(name)
  }
  const blob = text ?? ''
  for (const [pattern, name] of TEXT_MECHANICS) {
    if (pattern.test(blob)) found.add(name)
  }
  return MECHANIC_ORDER.filter((name) => found.has(name))
}

export function cardMechanics(card: { mechanics?: string[]; text?: string }): string[] {
  if (card.mechanics?.length) return card.mechanics
  return mechanicsFromCard(undefined, card.text)
}

export function cardHasMechanic(card: { mechanics?: string[]; text?: string }, mechanic: string): boolean {
  return cardMechanics(card).includes(mechanic)
}

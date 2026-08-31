const NUMERIC: Record<string, string> = {
  '12': 'PREMIUM',
  '20': 'TURN',
  '31': 'HERO_ENTITY',
  '47': 'ATK',
  '44': 'DAMAGE',
  '45': 'HEALTH',
  '49': 'ZONE',
  '50': 'CONTROLLER',
  '53': 'DURABILITY',
  '189': 'WINDFURY',
  '190': 'TAUNT',
  '191': 'STEALTH',
  '194': 'DIVINE_SHIELD',
  '199': 'CLASS',
  '202': 'CARDTYPE',
  '217': 'DEATHRATTLE',
  '263': 'ZONE_POSITION',
  '292': 'ARMOR',
  '363': 'POISONOUS',
  '1085': 'REBORN',
  '1207': 'MEGA_WINDFURY',
  '1522': 'BACON_IN_COMBAT_PHASE',
  '2853': 'VENOMOUS',
  '2989': 'BACON_CURRENT_COMBAT_PLAYER_ID',
  '1440': 'PLAYER_TECH_LEVEL',
  '1491': 'BACON_HERO_CAN_BE_DRAFTED',
  '2936': 'PLAYER_LEADERBOARD_PLACE',
  '1844': 'BACON_BLOODGEMBUFFATKVALUE',
  '2827': 'BACON_BLOODGEMBUFFHEALTHVALUE',
  '2': 'TAG_SCRIPT_DATA_NUM_1',
  '3': 'TAG_SCRIPT_DATA_NUM_2',
  '3989': 'TAVERN_SPELL_ATTACK_INCREASE',
  '3990': 'TAVERN_SPELL_HEALTH_INCREASE',
  '4001': 'BACON_ELEMENTAL_BUFFHEALTHVALUE',
  '4002': 'BACON_ELEMENTAL_BUFFATKVALUE',
  '4567': 'BACON_PIRATE_BUFFATKVALUE',
  '4568': 'BACON_PIRATE_BUFFHEALTHVALUE'
}

export function canonTag(raw: string): string {
  const key = raw.toUpperCase()
  return NUMERIC[key] ?? key
}

export function zoneName(value: string): string {
  const v = value.toUpperCase()
  if (v === '1' || v === 'PLAY') return 'PLAY'
  if (v === '2' || v === 'DECK') return 'DECK'
  if (v === '3' || v === 'HAND') return 'HAND'
  if (v === '4' || v === 'GRAVEYARD') return 'GRAVEYARD'
  if (v === '5' || v === 'REMOVEDFROMGAME') return 'REMOVEDFROMGAME'
  if (v === '6' || v === 'SETASIDE') return 'SETASIDE'
  return v
}

export function cardTypeName(value: string): string {
  const v = value.toUpperCase()
  if (v === '3' || v === 'HERO') return 'HERO'
  if (v === '4' || v === 'MINION') return 'MINION'
  if (v === '5' || v === 'SPELL') return 'SPELL'
  if (v === '6' || v === 'ENCHANTMENT') return 'ENCHANTMENT'
  if (v === '7' || v === 'WEAPON') return 'WEAPON'
  if (v === '10' || v === 'HERO_POWER') return 'HERO_POWER'
  if (v === '1' || v === 'GAME') return 'GAME'
  if (v === '2' || v === 'PLAYER') return 'PLAYER'
  return v
}

export function isTruthyTag(value: string): boolean {
  const v = value.toUpperCase()
  return v === '1' || v === 'TRUE'
}

export function powerPayload(line: string): string {
  const marker = ') - '
  const i = line.lastIndexOf(marker)
  return i >= 0 ? line.slice(i + marker.length) : line
}

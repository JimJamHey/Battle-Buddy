/** Combat text stripped of HSXML. */
import { keywordsFromText, unsupportedMechanicsInText } from './combatMechanics'

export function plainCardText(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[x\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const COUNT_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
}

export type CombatTrigger =
  | 'deathrattle'
  | 'avenge'
  | 'rally'
  | 'startOfCombat'
  | 'afterKill'
  | 'onSummon'

export type CombatOp =
  | 'summon'
  | 'summonRandom'
  | 'buff'
  | 'damage'
  | 'destroyKiller'
  | 'destroyLeft'
  | 'giveKeyword'
  | 'removeKeywords'
  | 'stealAttack'
  | 'playGem'
  | 'extraDeathrattle'
  | 'tribeAuraAttack'
  | 'shinyRing'
  | 'summonFromHand'
  | 'setHealth'

export type CombatTarget =
  | 'self'
  | 'defender'
  | 'randomFriendly'
  | 'otherFriendly'
  | 'allFriendly'
  | 'allEnemy'
  | 'randomEnemy'
  | 'allOther'
  | 'adjacentEnemy'
  | 'leftMost'
  | 'tribe'

export type HandSelect = 'random' | 'highestAttack' | 'leftmost'

export interface CombatEffect {
  op: CombatOp
  count?: number
  attack?: number
  health?: number
  keywords?: string[]
  target?: CombatTarget
  tribe?: string
  name?: string
  requiresSpace?: boolean
}

export interface CombatTriggerSet {
  when: CombatTrigger
  avenge?: number
  /** Tribe filter for `onSummon` listeners (e.g. Mech). */
  summonTribe?: string
  effects: CombatEffect[]
}

export interface CombatKit {
  triggers: CombatTriggerSet[]
  extraDeathrattles: number
  cleave: boolean
}

const EMPTY_KIT: CombatKit = { triggers: [], extraDeathrattles: 0, cleave: false }

function countWord(raw: string): number {
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  return COUNT_WORDS[raw.toLowerCase()] ?? 1
}

function keywordsIn(blob: string): string[] {
  return keywordsFromText(blob)
}

function tribeIn(blob: string): string | undefined {
  const match = blob.match(
    /\b(dragon|beast|demon|mech|murloc|naga|pirate|quilboar|undead|elemental)s?\b/i
  )
  if (!match) return undefined
  const name = match[1].toLowerCase()
  if (name === 'quilboar') return 'Quilboar'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function targetFrom(blob: string): CombatTarget {
  if (/all other minions/i.test(blob)) return 'allOther'
  if (/all (?:enemy )?minions/i.test(blob) && /enemy/i.test(blob)) return 'allEnemy'
  if (/your other minions/i.test(blob)) return 'otherFriendly'
  if (/all (?:your |friendly )?minions/i.test(blob) || /all your /i.test(blob) || /your minions/i.test(blob)) {
    return 'allFriendly'
  }
  if (/adjacent/i.test(blob) && /enemy|target/i.test(blob)) return 'adjacentEnemy'
  if (/left-?most/i.test(blob)) return 'leftMost'
  if (/another|other friendly|a different/i.test(blob)) return 'otherFriendly'
  if (/this minion|itself/i.test(blob)) return 'self'
  if (/the target/i.test(blob)) return 'defender'
  if (/an? enemy minion|a random enemy|enemy minions?/i.test(blob)) return 'randomEnemy'
  if (/a random friendly|a friendly/i.test(blob)) return 'randomFriendly'
  if (/\benemy\b/i.test(blob) && !/\byour\b|\bfriendly\b/i.test(blob)) return 'randomEnemy'
  return 'randomFriendly'
}

function parseSummon(clause: string): CombatEffect | null {
  if (!/summon/i.test(clause)) return null
  if (/\bcopy of\b/i.test(clause)) return null
  const random = clause.match(
    /summon(?:s)?\s+(\d+|a|an|one|two|three|four|five|six)?\s*random\s+(\w+)/i
  )
  if (random) {
    const tribe = tribeIn(random[2] || clause)
    if (tribe) {
      return { op: 'summonRandom', count: countWord(random[1] ?? 'a'), tribe }
    }
  }
  const stats = clause.match(
    /summon(?:s)?\s+(\d+|a|an|one|two|three|four|five|six)\s+(?:[^./]{0,48}?)(\d+)\s*\/\s*(\d+)/i
  )
  if (stats) {
    const nested = clause.match(/that summon(?:s)?\s+(\d+)\s*\/\s*(\d+)/i)
    const effect: CombatEffect = {
      op: 'summon',
      count: countWord(stats[1]),
      attack: Number(stats[2]),
      health: Number(stats[3]),
      keywords: keywordsIn(clause)
    }
    if (nested) {
      effect.name = `token:${nested[1]}/${nested[2]}`
    }
    return effect
  }
  const named = clause.match(
    /summon(?:s)?\s+(\d+|a|an|one|two|three|four|five|six)\s+(?:random\s+)?(.+?)(?:\.|$)/i
  )
  if (!named) return null
  const rest = named[2].replace(/\s+with\s+.+$/i, '').replace(/\s+for this combat only.*$/i, '').trim()
  const setStats = rest.match(/set its stats to\s+(\d+)\s*\/\s*(\d+)/i)
  if (setStats) {
    return {
      op: 'summon',
      count: countWord(named[1]),
      attack: Number(setStats[1]),
      health: Number(setStats[2]),
      keywords: keywordsIn(clause)
    }
  }
  return {
    op: 'summon',
    count: countWord(named[1]),
    name: rest.replace(/\s+from your hand.*$/i, '').trim(),
    keywords: keywordsIn(clause)
  }
}

function parseBuff(clause: string): CombatEffect | null {
  const atkAndKeyword = clause.match(
    /gain \+(\d+) attack and (divine shield|reborn|taunt|venomous|poisonous|windfury)/i
  )
  if (atkAndKeyword) {
    return {
      op: 'buff',
      attack: Number(atkAndKeyword[1]),
      health: 0,
      target: 'self',
      keywords: keywordsIn(atkAndKeyword[2])
    }
  }
  const buff = clause.match(/\+(\d+)\s*\/\s*\+(\d+)/)
  if (!buff) {
    const atkOnly = clause.match(/gain \+(\d+) attack/i) || clause.match(/have \+(\d+) attack/i)
    if (atkOnly) {
      return { op: 'buff', attack: Number(atkOnly[1]), health: 0, target: 'self' }
    }
    return null
  }
  const tribe = tribeIn(clause)
  let target: CombatTarget = targetFrom(clause)
  if (/this minion|itself|gain \+/i.test(clause) && !/give /i.test(clause)) target = 'self'
  if (/other (?:friendly )?(?:dragons|beasts|mechs|murlocs|nagas|pirates|quilboar|undead|elementals)/i.test(clause)) {
    target = 'tribe'
  }
  if (tribe && /your (?:other )?/.test(clause) && /give/i.test(clause)) target = 'tribe'
  return {
    op: 'buff',
    attack: Number(buff[1]),
    health: Number(buff[2]),
    target,
    tribe,
    keywords: keywordsIn(clause)
  }
}

function parseDamage(clause: string): CombatEffect | null {
  if (/deal damage equal to this minion's attack/i.test(clause)) {
    return { op: 'damage', count: -1, target: /adjacent/i.test(clause) ? 'adjacentEnemy' : 'defender' }
  }
  const all = clause.match(/deal\s+(\d+)\s+damage to all (other |enemy )?minions/i)
  if (all) {
    const who = (all[2] || '').toLowerCase()
    const target: CombatTarget = who.includes('other') ? 'allOther' : who.includes('enemy') ? 'allEnemy' : 'allOther'
    return { op: 'damage', attack: Number(all[1]), target }
  }
  const n = clause.match(/deal\s+(\d+)\s+damage/i)
  if (!n) return null
  return {
    op: 'damage',
    attack: Number(n[1]),
    count: /twice/i.test(clause) ? 2 : 1,
    target: targetFrom(clause)
  }
}

function parseSummonFromHand(clause: string): CombatEffect {
  const tribe = tribeIn(clause)
  let select: HandSelect = 'random'
  if (/highest-?attack/i.test(clause)) select = 'highestAttack'
  else if (/left-?most/i.test(clause)) select = 'leftmost'
  const countMatch = clause.match(/summon(?:s)?\s+(\d+|a|an|one|two|three|four|five|six)/i)
  return {
    op: 'summonFromHand',
    count: countMatch ? countWord(countMatch[1]) : 1,
    tribe,
    select,
    requiresSpace: /when you have space/i.test(clause)
  }
}

function parseClause(clause: string): CombatEffect[] {
  const text = clause.trim()
  if (!text) return []
  if (/deathrattles trigger an extra time/i.test(text)) return [{ op: 'extraDeathrattle' }]
  if (/destroy the minion that killed this/i.test(text)) return [{ op: 'destroyKiller' }]
  if (/destroy the minion to the left/i.test(text)) return [{ op: 'destroyLeft' }]
  if (/remove reborn and taunt from the target/i.test(text)) {
    return [{ op: 'removeKeywords', target: 'defender', keywords: ['reborn', 'taunt'] }]
  }
  if (/gain the target's attack/i.test(text)) return [{ op: 'stealAttack' }]
  if (/plays a blood gem on all your other minions/i.test(text)) {
    return [{ op: 'playGem', target: 'otherFriendly' }]
  }
  if (/plays (?:a blood gem|(\d+) permanent blood gems) on itself/i.test(text)) {
    const n = text.match(/plays (\d+)/i)
    return [{ op: 'playGem', target: 'self', count: n ? Number(n[1]) : 1 }]
  }
  if (/cast shiny ring twice/i.test(text)) return [{ op: 'shinyRing', count: 2 }]
  if (/for the rest of this combat, your (\w+)s? have \+(\d+) attack/i.test(text)) {
    const m = text.match(/your (\w+)s? have \+(\d+) attack/i)
    return m ? [{ op: 'tribeAuraAttack', tribe: tribeIn(text), attack: Number(m[2]) }] : []
  }
  if (/give another friendly \w+ venomous/i.test(text)) {
    return [{ op: 'giveKeyword', target: 'otherFriendly', keywords: ['venomous'], tribe: tribeIn(text) }]
  }
  if (/give a different friendly \w+ reborn/i.test(text)) {
    return [{ op: 'giveKeyword', target: 'otherFriendly', keywords: ['reborn'], tribe: tribeIn(text) }]
  }
  if (/summon(?:s)? .* from your hand/i.test(text)) return [parseSummonFromHand(text)]
  const summon = parseSummon(text)
  const damage = parseDamage(text)
  const buff = parseBuff(text)
  const out: CombatEffect[] = []
  if (summon) out.push(summon)
  if (damage) out.push(damage)
  if (buff) out.push(buff)
  return out
}

function splitClauses(body: string): string[] {
  return body
    .split(/(?<=\.)\s+|(?<=!)\s+/)
    .map((part) => part.replace(/\.+$/, '').trim())
    .filter(Boolean)
}

function parseTriggered(when: CombatTrigger, body: string, avenge?: number): CombatTriggerSet | null {
  const effects = splitClauses(body).flatMap(parseClause)
  if (!effects.length) return null
  return { when, avenge, effects }
}

export function parseCardCombat(text: string): CombatKit {
  const raw = plainCardText(text)
  if (!raw) return { ...EMPTY_KIT }
  const triggers: CombatTriggerSet[] = []
  let extraDeathrattles = 0
  const extra = raw.match(
    /your deathrattles trigger (?:(\d+|a|an|one|two|three|four|five|six) extra times?|an extra time|twice)/i
  )
  if (extra) {
    if (extra[1]) extraDeathrattles = countWord(extra[1])
    else extraDeathrattles = /twice/i.test(extra[0]) ? 2 : 1
  }

  const avenge = raw.match(/avenge\s*\((\d+)\)\s*:\s*(.+?)(?=(?:deathrattle|rally|start of combat|$))/i)
  if (avenge) {
    const set = parseTriggered('avenge', avenge[2], Number(avenge[1]))
    if (set) triggers.push(set)
  }
  const soc = raw.match(/start of combat\s*:\s*(.+?)(?=(?:deathrattle|rally|avenge|$))/i)
  if (soc) {
    const set = parseTriggered('startOfCombat', soc[1])
    if (set) triggers.push(set)
  }
  const rally = raw.match(/\brally\s*:\s*(.+?)(?=(?:deathrattle|start of combat|avenge|$))/i)
  if (rally) {
    const set = parseTriggered('rally', rally[1])
    if (set) triggers.push(set)
  }
  const wheneverAttacks = raw.match(/whenever this attacks[,:]?\s*(.+?)(?=(?:deathrattle|rally|start of combat|avenge|$))/i)
  if (wheneverAttacks && !rally) {
    const set = parseTriggered('rally', wheneverAttacks[1])
    if (set) triggers.push(set)
  }
  const dr = raw.match(/deathrattle\s*:\s*(.+?)(?=(?:rally|start of combat|avenge|$))/i)
  if (dr) {
    const set = parseTriggered('deathrattle', dr[1])
    if (set) triggers.push(set)
  }
  if (/after this attacks and kills a minion, deal excess damage to an adjacent enemy/i.test(raw)) {
    triggers.push({
      when: 'afterKill',
      effects: [{ op: 'damage', count: -2, target: 'adjacentEnemy' }]
    })
  }
  const wheneverSummon = raw.match(
    /whenever you summon (?:a |an )?(\w+)\s+during combat,?\s*(.+?)(?=(?:whenever|rally|deathrattle|start of combat|avenge|$))/i
  )
  if (wheneverSummon) {
    const set = parseTriggered('onSummon', wheneverSummon[2])
    if (set) {
      set.summonTribe = tribeIn(`summon a ${wheneverSummon[1]}`)
      triggers.push(set)
    }
  }
  return {
    triggers,
    extraDeathrattles,
    cleave: /\bcleave\b/i.test(raw)
  }
}

function triggerBody(raw: string, kind: CombatTrigger): string | null {
  if (kind === 'avenge') {
    return raw.match(/avenge\s*\(\d+\)\s*:\s*(.+?)(?=(?:deathrattle|rally|start of combat|$))/i)?.[1] ?? null
  }
  if (kind === 'startOfCombat') {
    return raw.match(/start of combat\s*:\s*(.+?)(?=(?:deathrattle|rally|avenge|$))/i)?.[1] ?? null
  }
  if (kind === 'rally') {
    return raw.match(/\brally\s*:\s*(.+?)(?=(?:deathrattle|start of combat|avenge|$))/i)?.[1] ?? null
  }
  if (kind === 'deathrattle') {
    return raw.match(/deathrattle\s*:\s*(.+?)(?=(?:rally|start of combat|avenge|$))/i)?.[1] ?? null
  }
  return null
}

function bodyHasUnparsed(body: string): boolean {
  const clauses = splitClauses(body)
  if (!clauses.length) return true
  return clauses.some((clause) => clause.length >= 12 && parseClause(clause).length === 0)
}

export function combatParseGaps(text: string, mechanics: string[] = []): string[] {
  const raw = plainCardText(text)
  if (!raw && !mechanics.length) return []
  const kit = parseCardCombat(raw)
  const gaps: string[] = []
  const has = (when: CombatTrigger) => kit.triggers.some((row) => row.when === when)
  const mech = (name: string) => mechanics.some((tag) => tag.toLowerCase() === name.toLowerCase())
  if ((/\bdeathrattle\s*:/i.test(raw) || mech('Deathrattle')) && !has('deathrattle')) gaps.push('Deathrattle')
  if ((/\brally\s*:/i.test(raw) || mech('Rally')) && !has('rally')) gaps.push('Rally')
  if ((/start of combat\s*:/i.test(raw) || mech('Start of Combat')) && !has('startOfCombat')) {
    gaps.push('Start of Combat')
  }
  if ((/\bavenge\s*\(/i.test(raw) || mech('Avenge')) && !has('avenge')) gaps.push('Avenge')
  if (/whenever you summon .+ during combat/i.test(raw) && !has('onSummon')) gaps.push('On Summon')
  if (
    /during combat/i.test(raw) &&
    !/whenever you summon/i.test(raw) &&
    !has('onSummon') &&
    !has('rally') &&
    !has('deathrattle') &&
    !has('startOfCombat') &&
    !has('avenge')
  ) {
    gaps.push('During Combat')
  }
  for (const kind of ['deathrattle', 'rally', 'startOfCombat', 'avenge'] as const) {
    const body = triggerBody(raw, kind)
    if (body && has(kind) && bodyHasUnparsed(body)) gaps.push('Unparsed')
  }
  const blob = `${raw} ${mechanics.join(' ')}`
  if (/summon(?:s)? a random\b/i.test(blob) && !kit.triggers.some((row) => row.effects.some((fx) => fx.op === 'summonRandom'))) {
    gaps.push('Random summon')
  }
  const combatBlob = [
    triggerBody(raw, 'deathrattle'),
    triggerBody(raw, 'rally'),
    triggerBody(raw, 'startOfCombat'),
    triggerBody(raw, 'avenge'),
    raw.match(/whenever you summon .+ during combat,?\s*(.+)/i)?.[1] ?? ''
  ]
    .filter(Boolean)
    .join(' ')
  gaps.push(...unsupportedMechanicsInText(blob, combatBlob))
  return [...new Set(gaps)]
}

export function parseDeathrattleSummon(text: string): { count: number; attack: number; health: number } | null {
  const kit = parseCardCombat(text)
  const summon = kit.triggers
    .find((row) => row.when === 'deathrattle')
    ?.effects.find((fx) => fx.op === 'summon' && fx.attack != null && fx.health != null)
  if (!summon || summon.attack == null || summon.health == null) return null
  return { count: summon.count ?? 1, attack: summon.attack, health: summon.health }
}

export type SocEffect = {
  kind: 'damageRandom' | 'damageAll' | 'buffSelf' | 'buffOthers'
  damage?: number
  count?: number
  attack?: number
  health?: number
}

export function parseStartOfCombat(text: string): SocEffect[] {
  const kit = parseCardCombat(text)
  const row = kit.triggers.find((item) => item.when === 'startOfCombat')
  if (!row) return []
  const out: SocEffect[] = []
  for (const fx of row.effects) {
    if (fx.op === 'damage' && fx.target === 'allOther') out.push({ kind: 'damageAll', damage: fx.attack })
    else if (fx.op === 'damage') out.push({ kind: 'damageRandom', damage: fx.attack ?? 0, count: fx.count ?? 1 })
    else if (fx.op === 'buff' && fx.target === 'self') out.push({ kind: 'buffSelf', attack: fx.attack, health: fx.health })
    else if (fx.op === 'buff') out.push({ kind: 'buffOthers', attack: fx.attack, health: fx.health })
  }
  return out
}

export function cardHasCleave(mechanics: string[] | undefined, text: string | undefined): boolean {
  if ((mechanics ?? []).some((tag) => tag.toUpperCase() === 'CLEAVE')) return true
  return parseCardCombat(text ?? '').cleave
}

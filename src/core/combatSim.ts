import {
  cardHasCleave,
  combatParseGaps,
  type CombatEffect,
  type CombatKit,
  type CombatTarget,
  type CombatTriggerSet
} from './combatEffects'
import { kitCoversGap, kitLookupIds, lookupCombatKit } from './combatKits'
import { pickRandomSummon, summonPoolHasTribe, type SummonPools } from './combatSummonPools'

export type { CombatKit } from './combatEffects'
export { cardHasCleave, parseCardCombat, parseDeathrattleSummon, parseStartOfCombat, combatParseGaps } from './combatEffects'
export { COMBAT_KITS, lookupCombatKit, mergeCombatKits } from './combatKits'

export const COMBAT_QUICK_SAMPLES = 48
export const COMBAT_FULL_SAMPLES = 640

export interface CombatMinion {
  cardId: string
  name: string
  attack: number
  health: number
  divineShield: boolean
  taunt: boolean
  poisonous: boolean
  venomous: boolean
  reborn: boolean
  windfury: boolean
  megaWindfury: boolean
  deathrattle: boolean
  golden?: boolean
  stealth?: boolean
  cleave?: boolean
  tribes?: string[]
  kit?: CombatKit
}

export interface CombatSide {
  playerId: number
  name: string
  heroHealth: number
  heroArmor: number
  tavernTier?: number
  minions: CombatMinion[]
  hand?: CombatMinion[]
  trinkets?: CombatMinion[]
}

export interface NamedCombatBody {
  attack: number
  health: number
  kit: CombatKit
  tribes: string[]
}

export interface CombatInput {
  friendly: CombatSide
  opponent: CombatSide
  gems?: { attack: number; health: number }
  opponentGems?: { attack: number; health: number }
  named?: Record<string, NamedCombatBody>
}

export interface CombatResult {
  samples: number
  lethal: number
  win: number
  tie: number
  loss: number
  died: number
  dealtMin: number
  dealtMax: number
  takenMin: number
  takenMax: number
}

export interface DeathrattleSummon {
  attack: number
  health: number
  count: number
}

const BOARD_CAP = 7

interface SimMinion {
  uid: number
  cardId: string
  name: string
  attack: number
  health: number
  divineShield: boolean
  taunt: boolean
  poisonous: boolean
  venomous: boolean
  reborn: boolean
  rebornUsed: boolean
  windfury: boolean
  megaWindfury: boolean
  stealth: boolean
  cleave: boolean
  tribes: string[]
  kit: CombatKit
  avenge: number[]
  overkill: number
}

interface FightCtx {
  gems: [{ attack: number; health: number }, { attack: number; health: number }]
  extraDr: [number, number]
  auraAtk: [number, number]
  auraTribe: [string | undefined, string | undefined]
  named: Map<string, NamedCombatBody>
  nextUid: number
  killer: SimMinion | null
  hands: [SimMinion[], SimMinion[]]
  summonPools: SummonPools
  tavernTier: [number, number]
}

function summonFor(
  cardId: string,
  summons: Record<string, DeathrattleSummon | null>
): DeathrattleSummon | null {
  for (const id of kitLookupIds(cardId)) {
    if (Object.prototype.hasOwnProperty.call(summons, id)) return summons[id] ?? null
  }
  return null
}

function gemPair(input: CombatInput): FightCtx['gems'] {
  const fallback = { attack: 1, health: 1 }
  return [input.gems ?? fallback, input.opponentGems ?? fallback]
}

function living(board: SimMinion[]): SimMinion[] {
  return board.filter((m) => m.health > 0)
}

function hasTribe(m: SimMinion, tribe?: string): boolean {
  if (!tribe) return true
  const key = tribe.toLowerCase()
  return m.tribes.some((row) => row.toLowerCase() === key)
}

function attacksFor(m: SimMinion): number {
  if (m.megaWindfury) return 4
  if (m.windfury) return 2
  return 1
}

function toSim(m: CombatMinion, uid: number, summon: DeathrattleSummon | null): SimMinion {
  const kit: CombatKit = {
    triggers: [...(m.kit?.triggers ?? [])],
    extraDeathrattles: m.kit?.extraDeathrattles ?? 0,
    cleave: Boolean(m.cleave || m.kit?.cleave)
  }
  if (summon && !kit.triggers.some((row) => row.when === 'deathrattle')) {
    kit.triggers.push({
      when: 'deathrattle',
      effects: [{ op: 'summon', count: summon.count, attack: summon.attack, health: summon.health }]
    })
  }
  return {
    uid,
    cardId: m.cardId,
    name: m.name,
    attack: m.attack,
    health: Math.max(0, m.health),
    divineShield: m.divineShield,
    taunt: m.taunt,
    poisonous: m.poisonous,
    venomous: m.venomous,
    reborn: m.reborn,
    rebornUsed: false,
    windfury: m.windfury,
    megaWindfury: m.megaWindfury,
    stealth: Boolean(m.stealth),
    cleave: Boolean(m.cleave || kit.cleave),
    tribes: m.tribes ?? [],
    kit,
    avenge: kit.triggers.filter((row) => row.when === 'avenge').map(() => 0),
    overkill: 0
  }
}

function spawn(
  ctx: FightCtx,
  base: Partial<SimMinion> & { attack: number; health: number; name?: string }
): SimMinion {
  const kit = base.kit ?? { triggers: [], extraDeathrattles: 0, cleave: false }
  return {
    uid: ctx.nextUid++,
    cardId: base.cardId ?? '',
    name: base.name ?? 'Token',
    attack: base.attack,
    health: Math.max(1, base.health),
    divineShield: Boolean(base.divineShield),
    taunt: Boolean(base.taunt),
    poisonous: Boolean(base.poisonous),
    venomous: Boolean(base.venomous),
    reborn: Boolean(base.reborn),
    rebornUsed: false,
    windfury: Boolean(base.windfury),
    megaWindfury: Boolean(base.megaWindfury),
    stealth: Boolean(base.stealth),
    cleave: Boolean(base.cleave),
    tribes: base.tribes ?? [],
    kit,
    avenge: kit.triggers.filter((row) => row.when === 'avenge').map(() => 0),
    overkill: 0
  }
}

function applyHit(target: SimMinion, attack: number, venom: boolean): boolean {
  if (attack <= 0) return false
  if (target.divineShield) {
    target.divineShield = false
    return false
  }
  const before = target.health
  if (venom) target.health = 0
  else target.health -= attack
  target.overkill = Math.max(0, attack - before)
  return true
}

function pickDefender(board: SimMinion[], rng: () => number): SimMinion | null {
  const alive = living(board)
  if (!alive.length) return null
  const stealthed = alive.filter((m) => m.stealth)
  const exposed = stealthed.length === alive.length ? alive : alive.filter((m) => !m.stealth)
  const taunts = exposed.filter((m) => m.taunt)
  const pool = taunts.length ? taunts : exposed
  return pool[Math.floor(rng() * pool.length)] ?? null
}

function pickTarget(
  own: SimMinion[],
  enemy: SimMinion[],
  source: SimMinion,
  target: CombatTarget | undefined,
  tribe: string | undefined,
  rng: () => number,
  defender?: SimMinion | null
): SimMinion[] {
  const friends = living(own)
  const foes = living(enemy)
  switch (target) {
    case 'self':
      return source.health > 0 ? [source] : []
    case 'defender':
      return defender && defender.health > 0 ? [defender] : []
    case 'allFriendly':
      return friends
    case 'otherFriendly':
      return friends.filter((m) => m.uid !== source.uid && hasTribe(m, tribe))
    case 'allEnemy':
      return foes
    case 'allOther':
      return [...friends, ...foes].filter((m) => m.uid !== source.uid)
    case 'adjacentEnemy': {
      if (!defender) return []
      const i = enemy.indexOf(defender)
      return [enemy[i - 1], enemy[i + 1]].filter((m): m is SimMinion => Boolean(m && m.health > 0))
    }
    case 'leftMost':
      return friends[0] ? [friends[0]] : []
    case 'tribe':
      return friends.filter((m) => m.uid !== source.uid && hasTribe(m, tribe))
    case 'randomEnemy': {
      if (!foes.length) return []
      return [foes[Math.floor(rng() * foes.length)]!]
    }
    case 'randomFriendly':
    default: {
      const pool = friends.filter((m) => hasTribe(m, tribe))
      if (!pool.length) return []
      return [pool[Math.floor(rng() * pool.length)]!]
    }
  }
}

function applyKeyword(m: SimMinion, key: string): void {
  if (key === 'divineShield') m.divineShield = true
  if (key === 'taunt') m.taunt = true
  if (key === 'reborn') m.reborn = true
  if (key === 'venomous') m.venomous = true
  if (key === 'poisonous') m.poisonous = true
  if (key === 'windfury') m.windfury = true
  if (key === 'stealth') m.stealth = true
}

function summonFromEffect(fx: CombatEffect, ctx: FightCtx): SimMinion[] {
  const n = Math.max(1, fx.count ?? 1)
  const tokens: SimMinion[] = []
  for (let i = 0; i < n; i++) {
    if (fx.name && !fx.name.startsWith('token:')) {
      const named = ctx.named.get(fx.name.toLowerCase())
      if (named) {
        tokens.push(
          spawn(ctx, {
            name: fx.name,
            attack: named.attack,
            health: named.health,
            kit: named.kit,
            tribes: named.tribes,
            taunt: fx.keywords?.includes('taunt'),
            reborn: fx.keywords?.includes('reborn'),
            divineShield: fx.keywords?.includes('divineShield')
          })
        )
        continue
      }
    }
    const nested = fx.name?.match(/^token:(\d+)\/(\d+)$/)
    const childKit: CombatKit = nested
      ? {
          triggers: [
            {
              when: 'deathrattle',
              effects: [{ op: 'summon', count: 1, attack: Number(nested[1]), health: Number(nested[2]), keywords: ['taunt'] }]
            }
          ],
          extraDeathrattles: 0,
          cleave: false
        }
      : { triggers: [], extraDeathrattles: 0, cleave: false }
    tokens.push(
      spawn(ctx, {
        name: fx.name || 'Token',
        attack: fx.attack ?? 1,
        health: fx.health ?? 1,
        kit: childKit,
        taunt: fx.keywords?.includes('taunt'),
        reborn: fx.keywords?.includes('reborn'),
        divineShield: fx.keywords?.includes('divineShield'),
        venomous: fx.keywords?.includes('venomous')
      })
    )
  }
  return tokens
}

function insertSummons(
  board: SimMinion[],
  at: number,
  tokens: SimMinion[],
  ctx?: FightCtx,
  side?: 0 | 1
): SimMinion[] {
  if (ctx && side != null) {
    const bonus = ctx.auraAtk[side]
    const tribe = ctx.auraTribe[side]
    if (bonus) {
      for (const token of tokens) {
        if (hasTribe(token, tribe)) token.attack += bonus
      }
    }
  }
  const room = BOARD_CAP - board.length
  if (room <= 0 || !tokens.length) return []
  const added = tokens.slice(0, room)
  board.splice(at, 0, ...added)
  return added
}

function fireOnSummon(
  summoned: SimMinion[],
  own: SimMinion[],
  enemy: SimMinion[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1
): void {
  for (const token of summoned) {
    for (const listener of [...living(own)]) {
      if (listener.uid === token.uid) continue
      for (const row of listener.kit.triggers) {
        if (row.when !== 'onSummon') continue
        if (row.summonTribe && !hasTribe(token, row.summonTribe)) continue
        runEffects(listener, own, enemy, row.effects, ctx, rng, side, token)
      }
    }
  }
}

function addSummons(
  own: SimMinion[],
  enemy: SimMinion[],
  at: number,
  tokens: SimMinion[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1,
  fireEvents = true
): SimMinion[] {
  const added = insertSummons(own, at, tokens, ctx, side)
  if (fireEvents && added.length) fireOnSummon(added, own, enemy, ctx, rng, side)
  return added
}

function pickFromHand(hand: SimMinion[], fx: CombatEffect, rng: () => number): SimMinion | null {
  let pool = hand.filter((m) => !fx.tribe || hasTribe(m, fx.tribe))
  if (!pool.length) return null
  if (fx.select === 'highestAttack') {
    const max = Math.max(...pool.map((m) => m.attack))
    pool = pool.filter((m) => m.attack === max)
    return pool[0] ?? null
  }
  if (fx.select === 'leftmost') return pool[0] ?? null
  return pool[Math.floor(rng() * pool.length)] ?? null
}

function runEffects(
  source: SimMinion,
  own: SimMinion[],
  enemy: SimMinion[],
  effects: CombatEffect[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1,
  defender?: SimMinion | null,
  insertAt?: number
): void {
  for (const fx of effects) {
    if (fx.op === 'summon') {
      addSummons(own, enemy, insertAt ?? own.length, summonFromEffect(fx, ctx), ctx, rng, side)
      continue
    }
    if (fx.op === 'summonRandom') {
      const tokens: SimMinion[] = []
      for (let i = 0; i < (fx.count ?? 1); i++) {
        const body = pickRandomSummon(ctx.summonPools, fx.tribe, rng, ctx.tavernTier[side])
        if (!body) continue
        tokens.push(
          spawn(ctx, {
            cardId: body.cardId,
            name: body.name,
            attack: body.attack,
            health: body.health,
            tribes: body.tribes,
            kit: body.kit
          })
        )
      }
      addSummons(own, enemy, insertAt ?? own.length, tokens, ctx, rng, side)
      continue
    }
    if (fx.op === 'summonFromHand') {
      if (fx.requiresSpace && BOARD_CAP - living(own).length <= 0) continue
      const hand = ctx.hands[side]
      const n = Math.max(1, fx.count ?? 1)
      const tokens: SimMinion[] = []
      for (let i = 0; i < n && hand.length; i++) {
        if (BOARD_CAP - own.length - tokens.length <= 0) break
        const pick = pickFromHand(hand, fx, rng)
        if (!pick) break
        const idx = hand.indexOf(pick)
        if (idx >= 0) hand.splice(idx, 1)
        tokens.push(pick)
      }
      addSummons(own, enemy, insertAt ?? own.length, tokens, ctx, rng, side)
      continue
    }
    if (fx.op === 'destroyKiller' && ctx.killer && ctx.killer.health > 0) {
      ctx.killer.health = 0
      continue
    }
    if (fx.op === 'destroyLeft') {
      const i = own.indexOf(source)
      const left = own[i - 1]
      if (left && left.health > 0) left.health = 0
      continue
    }
    if (fx.op === 'extraDeathrattle') {
      ctx.extraDr[side] += 1
      continue
    }
    if (fx.op === 'tribeAuraAttack') {
      ctx.auraAtk[side] += fx.attack ?? 0
      ctx.auraTribe[side] = fx.tribe
      for (const m of living(own)) {
        if (hasTribe(m, fx.tribe)) m.attack += fx.attack ?? 0
      }
      continue
    }
    if (fx.op === 'stealAttack' && defender) {
      const stolen = Math.max(0, defender.attack)
      source.attack += stolen
      defender.attack = Math.max(0, defender.attack - stolen)
      continue
    }
    if (fx.op === 'removeKeywords' && defender) {
      if (fx.keywords?.includes('reborn')) defender.reborn = false
      if (fx.keywords?.includes('taunt')) defender.taunt = false
      continue
    }
    if (fx.op === 'setHealth') {
      for (const m of pickTarget(own, enemy, source, fx.target, fx.tribe, rng, defender)) {
        m.health = Math.max(1, fx.health ?? 1)
      }
      continue
    }
    if (fx.op === 'playGem') {
      const gemAtk = ctx.gems[side].attack
      const gemHp = ctx.gems[side].health
      const times = fx.count ?? 1
      const targets = pickTarget(own, enemy, source, fx.target, fx.tribe, rng, defender)
      for (const m of targets) {
        m.attack += gemAtk * times
        m.health += gemHp * times
      }
      continue
    }
    if (fx.op === 'shinyRing') {
      for (let i = 0; i < (fx.count ?? 1); i++) {
        const pool = living(own)
        if (!pool.length) break
        const m = pool[Math.floor(rng() * pool.length)]!
        m.attack += 1
        m.health += 1
      }
      continue
    }
    if (fx.op === 'giveKeyword') {
      for (const m of pickTarget(own, enemy, source, fx.target, fx.tribe, rng, defender)) {
        for (const key of fx.keywords ?? []) applyKeyword(m, key)
      }
      continue
    }
    if (fx.op === 'buff') {
      for (const m of pickTarget(own, enemy, source, fx.target, fx.tribe, rng, defender)) {
        m.attack += fx.attack ?? 0
        m.health += fx.health ?? 0
        for (const key of fx.keywords ?? []) applyKeyword(m, key)
      }
      continue
    }
    if (fx.op === 'damage') {
      const times = fx.count === -1 || fx.count === -2 ? 1 : Math.max(1, fx.count ?? 1)
      for (let i = 0; i < times; i++) {
        const targets = pickTarget(own, enemy, source, fx.target, fx.tribe, rng, defender)
        for (const m of targets) {
          const dmg = fx.count === -1 ? source.attack : fx.count === -2 ? source.overkill : (fx.attack ?? 0)
          applyHit(m, dmg, false)
        }
      }
    }
  }
}

function trigger(
  when: CombatTriggerSet['when'],
  source: SimMinion,
  own: SimMinion[],
  enemy: SimMinion[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1,
  defender?: SimMinion | null,
  insertAt?: number
): void {
  for (const row of source.kit.triggers) {
    if (row.when !== when) continue
    runEffects(source, own, enemy, row.effects, ctx, rng, side, defender, insertAt)
  }
}

function noteAvenge(own: SimMinion[], deadUid: number): void {
  for (const m of living(own)) {
    if (m.uid === deadUid) continue
    let i = 0
    for (const row of m.kit.triggers) {
      if (row.when !== 'avenge' || row.avenge == null) continue
      m.avenge[i] = (m.avenge[i] ?? 0) + 1
      i += 1
    }
  }
}

function fireAvenge(
  own: SimMinion[],
  enemy: SimMinion[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1
): void {
  for (const m of [...living(own)]) {
    let i = 0
    for (const row of m.kit.triggers) {
      if (row.when !== 'avenge' || row.avenge == null) continue
      while ((m.avenge[i] ?? 0) >= row.avenge) {
        m.avenge[i] -= row.avenge
        runEffects(m, own, enemy, row.effects, ctx, rng, side)
      }
      i += 1
    }
  }
}

function resolveDeaths(
  own: SimMinion[],
  enemy: SimMinion[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1
): void {
  let guard = 0
  while (guard++ < 40) {
    const deadIdx = own.findIndex((m) => m.health <= 0)
    if (deadIdx < 0) break
    const dead = own[deadIdx]
    own.splice(deadIdx, 1)
    noteAvenge(own, dead.uid)
    const extras = own.reduce((n, m) => n + m.kit.extraDeathrattles, 0)
    const repeats = 1 + extras + ctx.extraDr[side]
    for (let n = 0; n < repeats; n++) {
      trigger('deathrattle', dead, own, enemy, ctx, rng, side, ctx.killer, deadIdx)
    }
    if (dead.reborn && !dead.rebornUsed) {
      insertSummons(own, deadIdx, [
        spawn(ctx, {
          ...dead,
          health: 1,
          divineShield: false,
          reborn: false,
          stealth: false,
          kit: dead.kit,
          tribes: dead.tribes,
          name: dead.name,
          cardId: dead.cardId,
          attack: dead.attack,
          taunt: dead.taunt,
          poisonous: dead.poisonous,
          venomous: dead.venomous,
          windfury: dead.windfury,
          megaWindfury: dead.megaWindfury,
          cleave: dead.cleave
        })
      ])
    }
    fireAvenge(own, enemy, ctx, rng, side)
  }
}

function strike(
  attacker: SimMinion,
  defender: SimMinion,
  defBoard: SimMinion[],
  ctx: FightCtx
): boolean {
  const aVenom = attacker.poisonous || attacker.venomous
  const bVenom = defender.poisonous || defender.venomous
  const aDealt = applyHit(defender, attacker.attack, aVenom)
  const bDealt = applyHit(attacker, defender.attack, bVenom)
  if (aDealt && attacker.venomous && !attacker.poisonous) attacker.venomous = false
  if (bDealt && defender.venomous && !defender.poisonous) defender.venomous = false
  ctx.killer = attacker
  if (attacker.cleave && attacker.attack > 0) {
    const i = defBoard.indexOf(defender)
    for (const adj of [defBoard[i - 1], defBoard[i + 1]]) {
      if (adj && adj.health > 0) applyHit(adj, attacker.attack, aVenom)
    }
  }
  return defender.health <= 0 && aDealt
}

function nextAttacker(board: SimMinion[], cursor: number): { minion: SimMinion; cursor: number } | null {
  if (!living(board).length) return null
  for (let step = 0; step < board.length; step++) {
    const i = (cursor + step) % board.length
    const m = board[i]
    if (m && m.health > 0 && m.attack > 0) return { minion: m, cursor: i }
  }
  return null
}

function leftoverDamage(board: SimMinion[], tavernTier: number): number {
  const atk = living(board).reduce((sum, m) => sum + Math.max(0, m.attack), 0)
  return living(board).length ? tavernTier + atk : 0
}

function applyStartOfCombat(
  own: SimMinion[],
  enemy: SimMinion[],
  ctx: FightCtx,
  rng: () => number,
  side: 0 | 1
): void {
  for (const m of [...own]) {
    if (m.health <= 0) continue
    trigger('startOfCombat', m, own, enemy, ctx, rng, side)
  }
}

export function fightOnce(
  input: CombatInput,
  summons: Record<string, DeathrattleSummon | null>,
  rng: () => number,
  friendlyFirst?: boolean,
  named: FightCtx['named'] = new Map(),
  summonPools: SummonPools = {}
): { win: 'friendly' | 'opponent' | 'tie'; damageToOpponent: number; damageToFriendly: number } {
  const ctx: FightCtx = {
    gems: gemPair(input),
    extraDr: [0, 0],
    auraAtk: [0, 0],
    auraTribe: [undefined, undefined],
    named,
    nextUid: 1,
    killer: null,
    hands: [[], []],
    summonPools,
    tavernTier: [
      Math.max(1, input.friendly.tavernTier ?? 1),
      Math.max(1, input.opponent.tavernTier ?? 1)
    ]
  }
  const fBoard = input.friendly.minions.map((m) => toSim(m, ctx.nextUid++, summonFor(m.cardId, summons)))
  const oBoard = input.opponent.minions.map((m) => toSim(m, ctx.nextUid++, summonFor(m.cardId, summons)))
  ctx.hands[0] = (input.friendly.hand ?? []).map((m) => toSim(m, ctx.nextUid++, summonFor(m.cardId, summons)))
  ctx.hands[1] = (input.opponent.hand ?? []).map((m) => toSim(m, ctx.nextUid++, summonFor(m.cardId, summons)))
  const fTrinkets = (input.friendly.trinkets ?? []).map((m) => toSim(m, ctx.nextUid++, null))
  const oTrinkets = (input.opponent.trinkets ?? []).map((m) => toSim(m, ctx.nextUid++, null))
  const fCount = living(fBoard).length
  const oCount = living(oBoard).length
  let fTurn = friendlyFirst ?? (fCount === oCount ? rng() < 0.5 : fCount > oCount)

  const firstOwn = fTurn ? fBoard : oBoard
  const firstEnemy = fTurn ? oBoard : fBoard
  const firstTrinkets = fTurn ? fTrinkets : oTrinkets
  const secondOwn = fTurn ? oBoard : fBoard
  const secondEnemy = fTurn ? fBoard : oBoard
  const secondTrinkets = fTurn ? oTrinkets : fTrinkets
  applyStartOfCombat(firstOwn, firstEnemy, ctx, rng, fTurn ? 0 : 1)
  for (const t of firstTrinkets) trigger('startOfCombat', t, firstOwn, firstEnemy, ctx, rng, fTurn ? 0 : 1)
  applyStartOfCombat(secondOwn, secondEnemy, ctx, rng, fTurn ? 1 : 0)
  for (const t of secondTrinkets) trigger('startOfCombat', t, secondOwn, secondEnemy, ctx, rng, fTurn ? 1 : 0)
  resolveDeaths(fBoard, oBoard, ctx, rng, 0)
  resolveDeaths(oBoard, fBoard, ctx, rng, 1)

  let fCursor = 0
  let oCursor = 0
  let steps = 0

  while (steps++ < 280 && living(fBoard).length && living(oBoard).length) {
    const atkBoard = fTurn ? fBoard : oBoard
    const defBoard = fTurn ? oBoard : fBoard
    const side: 0 | 1 = fTurn ? 0 : 1
    const found = nextAttacker(atkBoard, fTurn ? fCursor : oCursor)
    if (!found) {
      fTurn = !fTurn
      continue
    }
    if (found.minion.attack > 0) {
      const times = attacksFor(found.minion)
      for (let swing = 0; swing < times; swing++) {
        if (found.minion.health <= 0) break
        const defender = pickDefender(defBoard, rng)
        if (!defender) break
        const killed = strike(found.minion, defender, defBoard, ctx)
        found.minion.stealth = false
        found.minion.overkill = defender.overkill
        trigger('rally', found.minion, atkBoard, defBoard, ctx, rng, side, defender)
        if (killed) trigger('afterKill', found.minion, atkBoard, defBoard, ctx, rng, side, defender)
        resolveDeaths(fBoard, oBoard, ctx, rng, 0)
        resolveDeaths(oBoard, fBoard, ctx, rng, 1)
        if (!living(fBoard).length || !living(oBoard).length) break
      }
    }
    if (fTurn) fCursor = found.cursor + 1
    else oCursor = found.cursor + 1
    fTurn = !fTurn
  }

  const fLeft = living(fBoard).length
  const oLeft = living(oBoard).length
  const fTier = input.friendly.tavernTier ?? 1
  const oTier = input.opponent.tavernTier ?? 1
  const damageToOpponent = oLeft ? 0 : leftoverDamage(fBoard, fTier)
  const damageToFriendly = fLeft ? 0 : leftoverDamage(oBoard, oTier)
  if (fLeft && !oLeft) return { win: 'friendly', damageToOpponent, damageToFriendly }
  if (oLeft && !fLeft) return { win: 'opponent', damageToOpponent, damageToFriendly }
  return { win: 'tie', damageToOpponent: 0, damageToFriendly: 0 }
}

export function simulateCombat(
  input: CombatInput,
  summons: Record<string, DeathrattleSummon | null> = {},
  samples = COMBAT_FULL_SAMPLES,
  rng?: () => number,
  summonPools: SummonPools = {}
): CombatResult {
  const named = namedFromInput(input)
  const roll = rng ?? mulberry32(hashCombat(input))
  let lethal = 0
  let win = 0
  let tie = 0
  let loss = 0
  let died = 0
  let dealtMin = Number.POSITIVE_INFINITY
  let dealtMax = 0
  let takenMin = Number.POSITIVE_INFINITY
  let takenMax = 0
  const oppHp = Math.max(1, input.opponent.heroHealth + input.opponent.heroArmor)
  const selfHp = Math.max(1, input.friendly.heroHealth + input.friendly.heroArmor)

  for (let i = 0; i < samples; i++) {
    const r = fightOnce(input, summons, roll, undefined, named, summonPools)
    dealtMin = Math.min(dealtMin, r.damageToOpponent)
    dealtMax = Math.max(dealtMax, r.damageToOpponent)
    takenMin = Math.min(takenMin, r.damageToFriendly)
    takenMax = Math.max(takenMax, r.damageToFriendly)
    if (r.win === 'tie') {
      tie++
      continue
    }
    if (r.win === 'friendly') {
      win++
      if (r.damageToOpponent >= oppHp) lethal++
    } else {
      loss++
    }
    if (r.damageToFriendly >= selfHp) died++
  }

  const pct = (n: number) => (samples > 0 ? Math.round((n / samples) * 1000) / 10 : 0)
  return {
    samples,
    lethal: pct(lethal),
    win: pct(win),
    tie: pct(tie),
    loss: pct(loss),
    died: pct(died),
    dealtMin: Number.isFinite(dealtMin) ? dealtMin : 0,
    dealtMax,
    takenMin: Number.isFinite(takenMin) ? takenMin : 0,
    takenMax
  }
}

function namedFromInput(input: CombatInput): FightCtx['named'] {
  const named = new Map<string, NamedCombatBody>()
  for (const [name, body] of Object.entries(input.named ?? {})) {
    named.set(name.toLowerCase(), body)
  }
  return named
}

function hashCombat(input: CombatInput): number {
  const s = JSON.stringify(input)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const kitCache = new Map<string, CombatKit>()

function kitFor(
  cardId: string,
  text: string,
  card?: { id: string; name?: string; text?: string }
): CombatKit {
  const key = `${cardId}\n${text}`
  const hit = kitCache.get(key)
  if (hit) return hit
  const kit = lookupCombatKit(cardId, text, card)
  if (kitCache.size > 2000) kitCache.clear()
  kitCache.set(key, kit)
  return kit
}

type CatalogCard = {
  id: string
  name: string
  text?: string
  mechanics?: string[]
  tribes?: string[]
  attack?: number
  health?: number
}

function catalogCard(
  cardId: string,
  name: string,
  byId: Map<string, CatalogCard>,
  byName: Map<string, CatalogCard>
): CatalogCard | undefined {
  if (cardId) {
    for (const id of kitLookupIds(cardId)) {
      const hit = byId.get(id)
      if (hit) return hit
    }
  }
  return name ? byName.get(name.toLowerCase()) : undefined
}

/** Names referenced by summon effects that need catalog stats (not inline N/N tokens). */
export function collectNamedSummonNames(input: CombatInput): Set<string> {
  const names = new Set<string>()
  const scan = (m: CombatMinion) => {
    const kit = m.kit
    if (!kit) return
    for (const row of kit.triggers) {
      for (const fx of row.effects) {
        if (fx.op !== 'summon' || !fx.name || fx.name.startsWith('token:')) continue
        if (fx.attack != null && fx.health != null) continue
        const key = fx.name.trim().toLowerCase()
        if (key) names.add(key)
      }
    }
  }
  const rows = [
    ...input.friendly.minions,
    ...input.opponent.minions,
    ...(input.friendly.hand ?? []),
    ...(input.opponent.hand ?? []),
    ...(input.friendly.trinkets ?? []),
    ...(input.opponent.trinkets ?? [])
  ]
  for (const m of rows) scan(m)
  return names
}

function namedBodyForCard(
  card: CatalogCard,
  kitFor: (cardId: string, text: string, card?: CatalogCard) => CombatKit
): NamedCombatBody {
  return {
    attack: card.attack ?? 1,
    health: card.health ?? 1,
    kit: kitFor(card.id, card.text ?? '', card),
    tribes: card.tribes ?? []
  }
}

export function enrichCombatInput(input: CombatInput, catalog: CatalogCard[]): CombatInput {
  const byId = new Map(catalog.map((card) => [card.id, card]))
  const byName = new Map(catalog.map((card) => [card.name.toLowerCase(), card]))
  const enrich = (m: CombatMinion): CombatMinion => {
    const card = catalogCard(m.cardId, m.name, byId, byName)
    const text = card?.text ?? ''
    const kit = m.kit ?? kitFor(m.cardId || m.name, text, card)
    return {
      ...m,
      name: m.name || card?.name || m.name,
      cleave: m.cleave || cardHasCleave(card?.mechanics, text),
      tribes: m.tribes?.length ? m.tribes : card?.tribes,
      kit
    }
  }
  const enriched: CombatInput = {
    ...input,
    named: { ...(input.named ?? {}) },
    friendly: {
      ...input.friendly,
      minions: input.friendly.minions.map(enrich),
      hand: input.friendly.hand?.map(enrich),
      trinkets: input.friendly.trinkets?.map(enrich)
    },
    opponent: {
      ...input.opponent,
      minions: input.opponent.minions.map(enrich),
      hand: input.opponent.hand?.map(enrich),
      trinkets: input.opponent.trinkets?.map(enrich)
    }
  }
  const named = enriched.named ?? {}
  for (const key of collectNamedSummonNames(enriched)) {
    if (named[key]) continue
    const card = byName.get(key)
    if (!card) continue
    named[key] = namedBodyForCard(card, kitFor)
  }
  return { ...enriched, named }
}

export type GapReport = {
  partial: boolean
  reasons: string[]
  /** Which sides contribute gaps: 'friendly', 'opponent', or both */
  sides: ('friendly' | 'opponent')[]
}

export function combatGapReport(
  input: CombatInput,
  catalog: { id: string; name: string; text?: string; mechanics?: string[]; techLevel?: number }[],
  summonPools: SummonPools = {}
): GapReport {
  const byId = new Map(catalog.map((card) => [card.id, card]))
  const byName = new Map(catalog.map((card) => [card.name.toLowerCase(), card]))

  const sideReasons = (minions: CombatMinion[], label: 'friendly' | 'opponent') => {
    const reasons: string[] = []
    for (const m of minions) {
      const mReasons = cardRowGaps(m, byId, byName)
      for (const r of mReasons) reasons.push(`${label}: ${r}`)
    }
    return reasons
  }

  const friendlyRows = [
    ...input.friendly.minions,
    ...(input.friendly.hand ?? []),
    ...(input.friendly.trinkets ?? [])
  ]
  const opponentRows = [
    ...input.opponent.minions,
    ...(input.opponent.hand ?? []),
    ...(input.opponent.trinkets ?? [])
  ]

  const reasons: string[] = [
    ...sideReasons(friendlyRows, 'friendly'),
    ...sideReasons(opponentRows, 'opponent'),
    ...combatPoolGapReasons(input, summonPools),
    ...namedSummonGapReasons(input),
  ]

  const sides: ('friendly' | 'opponent')[] = []
  if (reasons.some((r) => r.startsWith('friendly:'))) sides.push('friendly')
  if (reasons.some((r) => r.startsWith('opponent:'))) sides.push('opponent')

  return { partial: reasons.length > 0, reasons, sides }
}

export function combatInputHasGaps(
  input: CombatInput,
  catalog: { id: string; name: string; text?: string; mechanics?: string[]; techLevel?: number }[],
  summonPools: SummonPools = {}
): boolean {
  return combatGapReport(input, catalog, summonPools).partial
}

/** Returns true if a cardId looks like a real Hearthstone card (not a test placeholder or bare token). */
function looksLikeRealCardId(cardId: string): boolean {
  if (!cardId || cardId.startsWith('token:')) return false
  // Real HS card ids contain at least one underscore and use alphanumeric segments
  return /^[A-Z]{2,}[\w]+_\w+/i.test(cardId)
}

function cardRowGaps(
  m: CombatMinion,
  byId: Map<string, { id: string; name: string; text?: string; mechanics?: string[] }>,
  byName: Map<string, { id: string; name: string; text?: string; mechanics?: string[] }>
): string[] {
  const card = catalogCard(m.cardId, m.name, byId, byName)
  const hasKit = (m.kit?.triggers.length ?? 0) > 0
  // Real card ID we can't find in catalog and has no pre-built kit — flag as possibly missing scripts
  if (!card && looksLikeRealCardId(m.cardId) && !hasKit) {
    if (m.deathrattle) return ['Unknown card with deathrattle']
    return ['Unknown card']
  }
  const text = card?.text ?? ''
  const kit = m.kit ?? kitFor(m.cardId || m.name, text, card)
  const gaps = combatParseGaps(text, card?.mechanics ?? []).filter((gap) => !kitCoversGap(kit, gap))
  if (gaps.length > 0) return gaps
  if (m.deathrattle && !kit.triggers.some((row) => row.when === 'deathrattle')) return ['Deathrattle']
  return []
}

/** Gaps from missing named summon catalog entries (would silently produce a 1/1). */
function namedSummonGapReasons(input: CombatInput): string[] {
  const named = input.named ?? {}
  const reasons: string[] = []
  for (const key of collectNamedSummonNames(input)) {
    if (!named[key]) reasons.push(`Unresolved summon: ${key}`)
  }
  return reasons
}

/** Gaps from missing tribe summon pools. */
function combatPoolGapReasons(input: CombatInput, summonPools: SummonPools): string[] {
  const tierFor = (side: CombatSide) => Math.max(1, side.tavernTier ?? 1)
  const reasons: string[] = []
  const checkSide = (side: CombatSide, label: string) => {
    const tier = tierFor(side)
    const scan = [...side.minions, ...(side.hand ?? []), ...(side.trinkets ?? [])]
    for (const m of scan) {
      const kit = m.kit
      if (!kit) continue
      for (const row of kit.triggers) {
        for (const fx of row.effects) {
          if (fx.op !== 'summonRandom' || !fx.tribe) continue
          const pool = summonPools[fx.tribe.toLowerCase()]?.filter((body) => body.techLevel <= tier) ?? []
          if (!pool.length) reasons.push(`${label}: Summon pool (${fx.tribe})`)
        }
      }
    }
  }
  checkSide(input.friendly, 'friendly')
  checkSide(input.opponent, 'opponent')
  return reasons
}


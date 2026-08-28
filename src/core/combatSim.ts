import {
  cardHasCleave,
  parseCardCombat,
  parseDeathrattleSummon,
  parseStartOfCombat,
  type CombatEffect,
  type CombatKit,
  type CombatTarget,
  type CombatTriggerSet
} from './combatEffects'

export type { CombatKit, SocEffect } from './combatEffects'
export { cardHasCleave, parseCardCombat, parseDeathrattleSummon, parseStartOfCombat }

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
  startOfCombat?: ReturnType<typeof parseStartOfCombat>
}

export interface CombatSide {
  playerId: number
  name: string
  heroHealth: number
  heroArmor: number
  tavernTier?: number
  minions: CombatMinion[]
}

export interface CombatInput {
  friendly: CombatSide
  opponent: CombatSide
  gems?: { attack: number; health: number }
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
  gems: { attack: number; health: number }
  extraDr: [number, number]
  auraAtk: [number, number]
  auraTribe: [string | undefined, string | undefined]
  named: Map<string, { attack: number; health: number; kit: CombatKit; tribes: string[] }>
  nextUid: number
  killer: SimMinion | null
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
    kit: base.kit ?? { triggers: [], extraDeathrattles: 0, cleave: false },
    avenge: [],
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
): void {
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
  if (room <= 0 || !tokens.length) return
  board.splice(at, 0, ...tokens.slice(0, room))
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
      insertSummons(own, insertAt ?? own.length, summonFromEffect(fx, ctx), ctx, side)
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
      source.attack += Math.max(0, defender.attack)
      continue
    }
    if (fx.op === 'removeKeywords' && defender) {
      if (fx.keywords?.includes('reborn')) defender.reborn = false
      if (fx.keywords?.includes('taunt')) defender.taunt = false
      continue
    }
    if (fx.op === 'playGem') {
      const gemAtk = ctx.gems.attack
      const gemHp = ctx.gems.health
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
    if (board[i] && board[i].health > 0) return { minion: board[i], cursor: i }
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
  named: FightCtx['named'] = new Map()
): { win: 'friendly' | 'opponent' | 'tie'; damageToOpponent: number; damageToFriendly: number } {
  const ctx: FightCtx = {
    gems: input.gems ?? { attack: 1, health: 1 },
    extraDr: [0, 0],
    auraAtk: [0, 0],
    auraTribe: [undefined, undefined],
    named,
    nextUid: 1,
    killer: null
  }
  const fBoard = input.friendly.minions.map((m) => toSim(m, ctx.nextUid++, summons[m.cardId] ?? null))
  const oBoard = input.opponent.minions.map((m) => toSim(m, ctx.nextUid++, summons[m.cardId] ?? null))
  const fCount = living(fBoard).length
  const oCount = living(oBoard).length
  let fTurn = friendlyFirst ?? (fCount === oCount ? rng() < 0.5 : fCount > oCount)

  applyStartOfCombat(fTurn ? fBoard : oBoard, fTurn ? oBoard : fBoard, ctx, rng, fTurn ? 0 : 1)
  applyStartOfCombat(fTurn ? oBoard : fBoard, fTurn ? fBoard : oBoard, ctx, rng, fTurn ? 1 : 0)
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
  samples = 400,
  rng: () => number = Math.random
): CombatResult {
  const named = namedFromInput(input)
  let lethal = 0
  let win = 0
  let tie = 0
  let loss = 0
  let died = 0
  let dealtMin = Infinity
  let dealtMax = 0
  let takenMin = Infinity
  let takenMax = 0
  const oppHp = Math.max(1, input.opponent.heroHealth + input.opponent.heroArmor)
  const selfHp = Math.max(1, input.friendly.heroHealth + input.friendly.heroArmor)

  for (let i = 0; i < samples; i++) {
    const r = fightOnce(input, summons, rng, undefined, named)
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
      if (r.damageToFriendly >= selfHp) died++
    }
  }

  const pct = (n: number) => Math.round((n / samples) * 1000) / 10
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
  const named = new Map<string, { attack: number; health: number; kit: CombatKit; tribes: string[] }>()
  for (const m of [...input.friendly.minions, ...input.opponent.minions]) {
    if (!m.name) continue
    named.set(m.name.toLowerCase(), {
      attack: m.attack,
      health: m.health,
      kit: m.kit ?? { triggers: [], extraDeathrattles: 0, cleave: false },
      tribes: m.tribes ?? []
    })
  }
  return named
}

export function enrichCombatInput(
  input: CombatInput,
  catalog: { id: string; name: string; text?: string; mechanics?: string[]; tribes?: string[]; attack?: number; health?: number }[]
): CombatInput {
  const byId = new Map(catalog.map((card) => [card.id, card]))
  const byName = new Map(catalog.map((card) => [card.name.toLowerCase(), card]))
  const enrich = (m: CombatMinion): CombatMinion => {
    const card = byId.get(m.cardId) ?? byName.get(m.name.toLowerCase())
    const text = card?.text ?? ''
    const kit = parseCardCombat(text)
    return {
      ...m,
      cleave: m.cleave || cardHasCleave(card?.mechanics, text),
      tribes: m.tribes?.length ? m.tribes : card?.tribes,
      kit,
      startOfCombat: m.startOfCombat?.length ? m.startOfCombat : parseStartOfCombat(text)
    }
  }
  return {
    ...input,
    friendly: { ...input.friendly, minions: input.friendly.minions.map(enrich) },
    opponent: { ...input.opponent, minions: input.opponent.minions.map(enrich) }
  }
}

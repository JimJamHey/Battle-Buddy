import { poolBaseId } from './cards'
import { parseCreating, parseEntityRef, parseNestedTag, parseTagChangeLine, parseUpdating, payloadOf } from './powerLog'
import { zoneName } from './tags'
import { poolCopies } from './pool'
import type { BgMinion } from './types'

interface Tracked {
  cardId: string
  zone: string
  player: number
  tavern: boolean
  clone: boolean
  held: boolean
  spell: boolean
}

/**
 * Shared tavern remaining-copy counts from Power.log.
 * Shop minions sitting in PLAY (Bob's tavern) are not taken until they enter HAND
 * (a buy) or a non-Bob PLAY/GRAVEYARD (a warband, including after combat).
 * Combat clones do not consume copies. Deaths stay consumed; only a shop sell
 * (SETASIDE / REMOVEDFROMGAME) returns a minion copy. Cast tavern spells stay taken.
 */
export class PoolTracker {
  private poolIds = new Set<string>()
  private spellIds = new Set<string>()
  private starting = new Map<string, number>()
  private taken = new Map<string, number>()
  private entities = new Map<number, Tracked>()
  private lastId = 0
  private inCombat = false
  private bobPlayers = new Set<number>()

  setCatalog(cards: BgMinion[]): void {
    this.poolIds = new Set()
    this.spellIds = new Set()
    this.starting = new Map()
    for (const card of cards) {
      if (card.kind !== 'minion' && card.kind !== 'spell') continue
      const id = poolBaseId(card.id)
      this.poolIds.add(id)
      this.starting.set(id, poolCopies(card))
      if (card.kind === 'spell') this.spellIds.add(id)
    }
  }

  setBobPlayers(ids: Iterable<number>): void {
    this.bobPlayers = new Set(ids)
  }

  reset(): void {
    this.taken.clear()
    this.entities.clear()
    this.lastId = 0
    this.inCombat = false
  }

  remaining(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [id, start] of this.starting) {
      out[id] = Math.max(0, start - (this.taken.get(id) ?? 0))
    }
    return out
  }

  remainingFor(cardId: string): number | null {
    const id = poolBaseId(cardId)
    if (!this.starting.has(id)) return null
    return Math.max(0, (this.starting.get(id) ?? 0) - (this.taken.get(id) ?? 0))
  }

  feed(line: string, inCombat: boolean, bobPlayers?: Iterable<number>): void {
    if (bobPlayers) this.setBobPlayers(bobPlayers)
    this.inCombat = inCombat
    const payload = payloadOf(line)

    if (/CREATE_GAME/i.test(payload) && !this.inCombat) {
      this.reset()
    }

    const created = parseCreating(payload)
    if (created) {
      this.lastId = created.id
      const e = this.ensure(this.lastId)
      if (created.cardId) e.cardId = created.cardId
      if (this.inCombat) e.clone = true
    }

    const updating = parseUpdating(payload)
    if (updating) {
      if (updating.id) this.lastId = updating.id
      if (updating.ref) this.applyRef(updating.ref, updating.cardId)
      else if (updating.cardId) this.ensure(this.lastId).cardId = updating.cardId
    }

    const tagChange = parseTagChangeLine(line)
    if (tagChange) {
      if (tagChange.ref) this.applyRef(tagChange.ref)
      const targetId = tagChange.entityId ?? this.lastId
      if (targetId) this.applyTag(this.ensure(targetId), tagChange.tag, tagChange.value)
    } else {
      const nested = parseNestedTag(payload)
      if (nested && this.lastId) this.applyTag(this.ensure(this.lastId), nested.tag, nested.value)
    }
  }

  private applyRef(ref: string, cardId?: string): void {
    const parsed = parseEntityRef(ref, cardId)
    if (!parsed) return
    this.lastId = parsed.id
    const e = this.ensure(this.lastId)
    if (parsed.cardId) e.cardId = parsed.cardId
    if (parsed.zone) e.zone = parsed.zone
    if (parsed.player) e.player = parsed.player
    this.syncHeld(e)
  }

  private applyTag(e: Tracked, tag: string, value: string): void {
    switch (tag) {
      case 'ZONE':
        e.zone = zoneName(value)
        break
      case 'CONTROLLER':
      case 'PLAYER_ID':
        e.player = Number(value) || e.player
        break
      case 'BACON_TAVERN':
      case '1678':
        e.tavern = value === '1' || value.toUpperCase() === 'TRUE'
        break
      default:
        break
    }
    this.syncHeld(e)
  }

  private syncHeld(e: Tracked): void {
    const id = poolBaseId(e.cardId)
    if (id && this.spellIds.has(id)) e.spell = true
    if (!id || !this.poolIds.has(id) || e.clone) {
      if (e.held) this.release(e)
      return
    }
    const shouldHold = this.isHeld(e)
    if (shouldHold && !e.held) {
      e.held = true
      this.taken.set(id, (this.taken.get(id) ?? 0) + 1)
    } else if (!shouldHold && e.held) {
      this.release(e)
    }
  }

  private isHeld(e: Tracked): boolean {
    if (e.clone || e.tavern) return false
    if (e.player > 0 && this.bobPlayers.has(e.player)) return false
    if (e.zone === 'HAND') return true
    if (e.zone === 'PLAY' && this.inCombat) return true
    if (e.held && (e.zone === 'PLAY' || e.zone === 'GRAVEYARD')) return true
    // Tavern spells are consumed on cast, not sold back into the pool.
    if (e.held && e.spell && (e.zone === 'SETASIDE' || e.zone === 'REMOVEDFROMGAME')) return true
    return false
  }

  private release(e: Tracked): void {
    if (!e.held) return
    e.held = false
    const id = poolBaseId(e.cardId)
    if (!id) return
    const next = (this.taken.get(id) ?? 1) - 1
    if (next <= 0) this.taken.delete(id)
    else this.taken.set(id, next)
  }

  private ensure(id: number): Tracked {
    let e = this.entities.get(id)
    if (!e) {
      e = {
        cardId: '',
        zone: '',
        player: 0,
        tavern: false,
        clone: false,
        held: false,
        spell: false
      }
      this.entities.set(id, e)
    }
    return e
  }
}

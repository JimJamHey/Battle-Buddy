import { poolBaseId } from './cards'
import { canonTag, powerPayload, zoneName } from './tags'
import { poolCopies } from './pool'
import type { BgMinion } from './types'

interface Tracked {
  cardId: string
  zone: string
  player: number
  tavern: boolean
  clone: boolean
  held: boolean
}

/**
 * Shared tavern remaining-copy counts from Power.log.
 * Shop minions sitting in PLAY are not taken until they enter HAND (a buy)
 * or show up on a warband during combat (another player's buy we only see then).
 * Combat clones and in-fight deaths do not return copies.
 */
export class PoolTracker {
  private poolIds = new Set<string>()
  private starting = new Map<string, number>()
  private taken = new Map<string, number>()
  private entities = new Map<number, Tracked>()
  private lastId = 0
  private inCombat = false
  private bobPlayers = new Set<number>()

  setCatalog(cards: BgMinion[]): void {
    this.poolIds = new Set()
    this.starting = new Map()
    for (const card of cards) {
      if (card.kind !== 'minion' && card.kind !== 'spell') continue
      const id = poolBaseId(card.id)
      this.poolIds.add(id)
      this.starting.set(id, poolCopies(card))
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
    const payload = powerPayload(line)

    if (/CREATE_GAME/i.test(payload) && !this.inCombat && this.entities.size === 0) {
      this.reset()
    }

    const created = payload.match(/FULL_ENTITY - Creating ID=(\d+)(?:\s+CardID=([A-Za-z0-9_]+))?/i)
    if (created) {
      this.lastId = Number(created[1])
      const e = this.ensure(this.lastId)
      if (created[2]) e.cardId = created[2]
      if (this.inCombat) e.clone = true
    }

    const updating = payload.match(
      /(?:FULL_ENTITY|SHOW_ENTITY|CHANGE_ENTITY) - Updating (?:Entity=)?(?:\[([^\]]+)\]|(\d+))(?:\s+CardID=([A-Za-z0-9_]+))?/i
    )
    if (updating) {
      if (updating[2]) this.lastId = Number(updating[2])
      if (updating[1]) this.applyRef(updating[1], updating[3])
      else if (updating[3]) this.ensure(this.lastId).cardId = updating[3]
    }

    const tagChange = payload.match(/TAG_CHANGE Entity=(?:\[([^\]]+)\]|(.+?))\s+tag=([A-Z0-9_]+)\s+value=(\S+)/i)
    if (tagChange) {
      const tag = canonTag(tagChange[3])
      const value = tagChange[4].replace(/,$/, '')
      if (tagChange[1]) this.applyRef(tagChange[1])
      const targetId = tagChange[1]
        ? this.lastId
        : /^\d+$/.test(tagChange[2])
          ? Number(tagChange[2])
          : 0
      if (targetId) this.applyTag(this.ensure(targetId), tag, value)
    } else {
      const tagLine = payload.match(/^(?:\s+)?tag=([A-Z0-9_]+)\s+value=(\S+)/i)
      if (tagLine && this.lastId) this.applyTag(this.ensure(this.lastId), canonTag(tagLine[1]), tagLine[2].replace(/,$/, ''))
    }
  }

  private applyRef(ref: string, cardId?: string): void {
    const idMatch = ref.match(/\bid=(\d+)/i)
    if (!idMatch) return
    this.lastId = Number(idMatch[1])
    const e = this.ensure(this.lastId)
    const cid = cardId || ref.match(/\bcardId=([A-Za-z0-9_]+)/i)?.[1]
    if (cid) e.cardId = cid
    const zone = ref.match(/\bzone=([A-Z]+)/i)?.[1]
    if (zone) e.zone = zoneName(zone)
    const player = ref.match(/\bplayer=(\d+)/i)?.[1]
    if (player) e.player = Number(player)
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
      e = { cardId: '', zone: '', player: 0, tavern: false, clone: false, held: false }
      this.entities.set(id, e)
    }
    return e
  }
}

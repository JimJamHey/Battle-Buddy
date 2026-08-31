import { isTrinketCardId } from './cards'
import { isBgHeroCardId } from './heroes'
import { parseCreating, parseEntityRef, parseNestedTag, parseTagChangeLine, parseUpdating, payloadOf } from './powerLog'
import { cardTypeName, isTruthyTag, zoneName } from './tags'
import type { CombatInput, CombatMinion, CombatSide } from './combatSim'

export type CombatEvent = 'start' | 'end' | null

export interface TrackedEntity {
  id: number
  cardId: string
  name: string
  zone: string
  zonePos: number
  player: number
  cardType: string
  atk: number
  health: number
  damage: number
  armor: number
  divineShield: boolean
  taunt: boolean
  poisonous: boolean
  venomous: boolean
  reborn: boolean
  windfury: boolean
  megaWindfury: boolean
  deathrattle: boolean
  stealth: boolean
  golden: boolean
}

function emptyEntity(id: number): TrackedEntity {
  return {
    id,
    cardId: '',
    name: '',
    zone: '',
    zonePos: 0,
    player: 0,
    cardType: '',
    atk: 0,
    health: 0,
    damage: 0,
    armor: 0,
    divineShield: false,
    taunt: false,
    poisonous: false,
    venomous: false,
    reborn: false,
    windfury: false,
    megaWindfury: false,
    deathrattle: false,
    stealth: false,
    golden: false
  }
}

function currentHp(e: TrackedEntity): number {
  return Math.max(0, e.health - e.damage)
}

export class BoardTracker {
  private entities = new Map<number, TrackedEntity>()
  private lastId = 0
  private inCombat = false
  private frozen: CombatInput | null = null
  private opponentPlayerId: number | null = null
  private opponentLobbyId: number | null = null
  private opponentName: string | null = null
  private pending = false
  private detectedHandPlayer: number | null = null

  reset(): void {
    this.entities.clear()
    this.lastId = 0
    this.inCombat = false
    this.frozen = null
    this.opponentPlayerId = null
    this.opponentLobbyId = null
    this.opponentName = null
    this.pending = false
    this.detectedHandPlayer = null
  }

  getDetectedHandPlayer(): number | null {
    return this.detectedHandPlayer
  }

  getFrozen(): CombatInput | null {
    return this.frozen
  }

  snapshotMinions(playerId: number): CombatMinion[] {
    if (playerId <= 0) return []
    return this.minionsFor(playerId).map((e) => this.toMinion(e))
  }

  setCombatOpponent(playerId: number, name?: string): void {
    if (playerId <= 0) return
    if (name) {
      this.opponentLobbyId = playerId
      this.opponentName = name.replace(/#\d+$/, '')
      if (this.opponentPlayerId == null || this.opponentPlayerId <= 8) {
        this.opponentPlayerId = playerId
      }
      return
    }
    if (playerId > 8) {
      this.opponentPlayerId = playerId
      return
    }
    if (this.opponentLobbyId == null) this.opponentLobbyId = playerId
    if (this.opponentPlayerId == null) this.opponentPlayerId = playerId
  }

  setCombatOpponentName(name: string): void {
    const stripped = name.replace(/#\d+$/, '').trim()
    if (stripped) this.opponentName = stripped
  }

  feed(line: string, friendlyPlayerId: number | null, playerName: (id: number) => string): CombatEvent {
    const payload = payloadOf(line)
    const fromTaskList = line.includes('PowerTaskList.')
    let event: CombatEvent = null

    if (payload.startsWith('CREATE_GAME')) {
      if (this.inCombat || this.pending || this.entities.size > 0) return null
      this.reset()
      return null
    }

    const created = parseCreating(payload)
    if (created) {
      this.lastId = created.id
      const e = this.ensure(this.lastId)
      if (created.cardId) e.cardId = created.cardId
    }

    const updating = parseUpdating(payload)
    if (updating) {
      if (updating.id) this.lastId = updating.id
      if (updating.ref) this.applyRef(updating.ref, updating.cardId)
      else if (updating.cardId) this.ensure(this.lastId).cardId = updating.cardId
    }

    const nested = parseNestedTag(payload)
    const tagChange = parseTagChangeLine(line)

    if (tagChange) {
      const tag = tagChange.tag
      const value = tagChange.value
      if (tagChange.ref) this.applyRef(tagChange.ref)
      const targetId = tagChange.entityId ?? this.lastId
      if (tagChange.entityName === 'GameEntity' || tagChange.entityName === 'Game') {
        event = this.applyGameTag(tag, value, friendlyPlayerId, playerName, fromTaskList) ?? event
      } else if (targetId) {
        this.applyTag(this.ensure(targetId), tag, value)
        this.noteHand(this.ensure(targetId))
      }
    } else if (nested && this.lastId) {
      this.applyTag(this.ensure(this.lastId), nested.tag, nested.value)
      this.noteHand(this.ensure(this.lastId))
    }

    if (/BLOCK_START\s+BlockType=ATTACK/i.test(payload) && this.inCombat && this.pending) {
      this.freeze(friendlyPlayerId, playerName)
      this.pending = false
      event = event ?? 'start'
    }

    if (this.pending && this.inCombat && this.boardsLookReady(friendlyPlayerId)) {
      this.freeze(friendlyPlayerId, playerName)
      this.pending = false
      event = event ?? 'start'
    }

    return event
  }

  private applyGameTag(
    tag: string,
    value: string,
    friendlyPlayerId: number | null,
    playerName: (id: number) => string,
    fromTaskList: boolean
  ): CombatEvent {
    if (tag === 'BACON_CURRENT_COMBAT_PLAYER_ID') {
      const id = Number(value)
      if (Number.isFinite(id) && id > 0) this.opponentPlayerId = id
    }
    if (tag === 'BACON_IN_COMBAT_PHASE') {
      const on = isTruthyTag(value)
      if (on && !this.inCombat) {
        this.inCombat = true
        this.pending = true
      } else if (on) {
        this.pending = true
      } else if (!on && this.inCombat && fromTaskList) {
        this.inCombat = false
        this.pending = false
        this.frozen = null
        this.opponentPlayerId = null
        this.opponentLobbyId = null
        this.opponentName = null
        return 'end'
      }
    }
    if (tag === 'STEP' && /COMBAT/i.test(value) && !this.inCombat) {
      this.inCombat = true
      this.pending = true
      this.frozen = null
    }
    if (this.pending && this.inCombat && this.boardsLookReady(friendlyPlayerId)) {
      this.freeze(friendlyPlayerId, playerName)
      this.pending = false
      return 'start'
    }
    return null
  }

  private boardsLookReady(friendlyPlayerId: number | null): boolean {
    const { self, opp } = this.combatSides(friendlyPlayerId)
    if (self == null || opp == null || self === opp) return false
    return this.minionsFor(self).length > 0 && this.minionsFor(opp).length > 0
  }

  private freeze(friendlyPlayerId: number | null, playerName: (id: number) => string): void {
    const { self, opp } = this.combatSides(friendlyPlayerId)
    if (self == null || opp == null || self === opp) return
    if (this.minionsFor(self).length === 0 && this.minionsFor(opp).length === 0) return
    const displayId = this.opponentLobbyId ?? this.opponentPlayerId ?? opp
    const named = this.opponentName && !/^(lady deathwhisper|kel'?thuzad|bob)$/i.test(this.opponentName)
      ? this.opponentName
      : null
    const name = named || playerName(displayId)
    this.frozen = {
      friendly: this.side(self, playerName(friendlyPlayerId ?? self)),
      opponent: { ...this.side(opp, name), playerId: displayId }
    }
  }

  /**
   * Combat clones often use controller ids other than lobby PLAYER_ID (1–8).
   * Never treat the only board with minions as the opponent — an empty enemy
   * warband used to freeze as a 100% loss.
   */
  private combatSides(lobbyFriendlyId: number | null): { self: number | null; opp: number | null } {
    const hintedOpp = this.opponentPlayerId
    const hintedLobby = this.opponentLobbyId
    const hinted = new Set<number>()
    if (hintedOpp != null && hintedOpp > 0) hinted.add(hintedOpp)
    if (hintedLobby != null && hintedLobby > 0) hinted.add(hintedLobby)

    const withMinions = this.otherPlayersWithMinions(null)
    let self: number | null = null
    if (lobbyFriendlyId != null && this.minionsFor(lobbyFriendlyId).length > 0) {
      self = lobbyFriendlyId
    } else if (
      this.detectedHandPlayer != null &&
      !hinted.has(this.detectedHandPlayer) &&
      this.minionsFor(this.detectedHandPlayer).length > 0
    ) {
      self = this.detectedHandPlayer
    } else {
      self = withMinions.find((id) => !hinted.has(id)) ?? null
    }

    let opp: number | null = null
    if (hintedOpp != null && hintedOpp !== self && this.minionsFor(hintedOpp).length > 0) {
      opp = hintedOpp
    } else {
      opp =
        withMinions.find((id) => id !== self) ??
        (hintedOpp != null && hintedOpp !== self ? hintedOpp : null) ??
        (hintedLobby != null && hintedLobby !== self ? hintedLobby : null)
    }

    if (self == null) self = lobbyFriendlyId ?? this.detectedHandPlayer
    if (self != null && opp === self) opp = null
    return { self, opp }
  }

  private otherPlayersWithMinions(friendlyPlayerId: number | null): number[] {
    const counts = new Map<number, number>()
    for (const m of this.boardMinions()) {
      if (friendlyPlayerId != null && m.player === friendlyPlayerId) continue
      if (m.player <= 0) continue
      counts.set(m.player, (counts.get(m.player) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }

  private side(playerId: number, name: string): CombatSide {
    const hero = [...this.entities.values()].find(
      (e) => e.player === playerId && e.cardType === 'HERO' && (e.zone === 'PLAY' || e.zone === '')
    )
    const minions = this.minionsFor(playerId).map((e) => this.toMinion(e))
    return {
      playerId,
      name,
      heroHealth: hero ? currentHp(hero) || 30 : 30,
      heroArmor: hero?.armor ?? 0,
      minions,
      hand: this.handFor(playerId).map((e) => this.toMinion(e)),
      trinkets: this.trinketsFor(playerId).map((e) => this.toMinion(e))
    }
  }

  private minionsFor(playerId: number): TrackedEntity[] {
    return this.boardMinions()
      .filter((e) => e.player === playerId && currentHp(e) > 0)
      .sort((a, b) => a.zonePos - b.zonePos)
  }

  private handFor(playerId: number): TrackedEntity[] {
    return [...this.entities.values()]
      .filter((e) => {
        if (e.player !== playerId || e.zone !== 'HAND') return false
        if (e.cardType === 'ENCHANTMENT' || e.cardType === 'HERO' || e.cardType === 'HERO_POWER') return false
        if (isBgHeroCardId(e.cardId) || isTrinketCardId(e.cardId)) return false
        return e.cardType === 'MINION' || Boolean(e.cardId)
      })
      .sort((a, b) => a.zonePos - b.zonePos)
  }

  private trinketsFor(playerId: number): TrackedEntity[] {
    return [...this.entities.values()].filter((e) => {
      if (e.player !== playerId) return false
      if (e.zone !== 'PLAY' && e.zone !== 'SECRET') return false
      return isTrinketCardId(e.cardId) || e.cardType.includes('TRINKET')
    })
  }

  private boardMinions(): TrackedEntity[] {
    return [...this.entities.values()].filter((e) => {
      if (e.zone !== 'PLAY') return false
      if (e.cardType && e.cardType !== 'MINION') return false
      if (isBgHeroCardId(e.cardId)) return false
      if (isTrinketCardId(e.cardId) || e.cardType.includes('TRINKET')) return false
      if (!e.cardId && e.cardType !== 'MINION') return false
      if (e.cardType === 'ENCHANTMENT' || e.cardType === 'HERO_POWER' || e.cardType === 'HERO') return false
      if (e.zonePos <= 0 && e.cardType !== 'MINION') return false
      return e.cardType === 'MINION' || Boolean(e.cardId)
    })
  }

  private toMinion(e: TrackedEntity): CombatMinion {
    return {
      cardId: e.cardId,
      name: e.name,
      attack: e.atk,
      health: Math.max(1, currentHp(e)),
      divineShield: e.divineShield,
      taunt: e.taunt,
      poisonous: e.poisonous,
      venomous: e.venomous,
      reborn: e.reborn,
      windfury: e.windfury,
      megaWindfury: e.megaWindfury,
      deathrattle: e.deathrattle,
      stealth: e.stealth,
      golden: e.golden || /_G$/i.test(e.cardId)
    }
  }

  private applyRef(ref: string, cardId?: string): void {
    const parsed = parseEntityRef(ref, cardId)
    if (!parsed) return
    this.lastId = parsed.id
    const e = this.ensure(this.lastId)
    if (parsed.cardId) e.cardId = parsed.cardId
    if (parsed.name) e.name = parsed.name
    if (parsed.zone) e.zone = parsed.zone
    if (parsed.zonePos != null) e.zonePos = parsed.zonePos
    if (parsed.player) e.player = parsed.player
  }

  private applyTag(e: TrackedEntity, tag: string, value: string): void {
    switch (tag) {
      case 'ATK':
        e.atk = Number(value) || 0
        break
      case 'HEALTH':
        e.health = Number(value) || 0
        break
      case 'DAMAGE':
        e.damage = Number(value) || 0
        break
      case 'ARMOR':
        e.armor = Number(value) || 0
        break
      case 'ZONE':
        e.zone = zoneName(value)
        break
      case 'ZONE_POSITION':
        e.zonePos = Number(value) || 0
        break
      case 'CONTROLLER':
        e.player = Number(value) || e.player
        break
      case 'PLAYER_ID':
        e.player = Number(value) || e.player
        break
      case 'CARDTYPE':
        e.cardType = cardTypeName(value)
        break
      case 'DIVINE_SHIELD':
        e.divineShield = isTruthyTag(value)
        break
      case 'TAUNT':
        e.taunt = isTruthyTag(value)
        break
      case 'POISONOUS':
        e.poisonous = isTruthyTag(value)
        break
      case 'VENOMOUS':
        e.venomous = isTruthyTag(value)
        break
      case 'REBORN':
        e.reborn = isTruthyTag(value)
        break
      case 'WINDFURY':
        e.windfury = isTruthyTag(value)
        break
      case 'MEGA_WINDFURY':
        e.megaWindfury = isTruthyTag(value)
        break
      case 'DEATHRATTLE':
        e.deathrattle = isTruthyTag(value)
        break
      case 'STEALTH':
        e.stealth = isTruthyTag(value)
        break
      case 'PREMIUM':
        e.golden = isTruthyTag(value)
        break
      default:
        break
    }
  }

  private noteHand(e: TrackedEntity): void {
    if (e.zone !== 'HAND' || !e.cardId || e.player <= 0) return
    if (e.cardType === 'ENCHANTMENT') return
    this.detectedHandPlayer = e.player
  }

  private ensure(id: number): TrackedEntity {
    let e = this.entities.get(id)
    if (!e) {
      e = emptyEntity(id)
      this.entities.set(id, e)
    }
    return e
  }
}

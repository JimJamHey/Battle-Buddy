import { classifyPlayerBuff, mergeBuffs, playerTagBuff, PLAYER_STAT_TAGS, PLAYER_TAG_KEYS, emptyTagBuffs } from './buffs'
import { BoardTracker, type CombatEvent } from './entities'
import { canonicalTribe, isBgHeroCardId, isPickedBgHero, looksLikeHeroName, sortTribes, TRIBE_ORDER, TRIBE_SUBSET_TAGS } from './heroes'
import {
  parseCreating,
  parseEntityName,
  parseEntityRef,
  parseGameEntity,
  parseNestedTag,
  parsePlayerEntity,
  parseTagChangeLine,
  parseUpdating,
  payloadOf
} from './powerLog'
import { EMPTY_MATCH, type MatchBuff, type MatchFinish, type MatchState, type SeenMinion } from './types'
import type { CombatInput } from './combatSim'

const PLACEHOLDER_NAMES = new Set([
  '',
  'bob',
  "bob's tavern",
  'bobs tavern',
  'the innkeeper',
  'unknown human player',
  'unknown player',
  'player',
  'baconplaceholder'
])

const BG_GAME_TYPES = new Set([
  'GT_BATTLEGROUNDS',
  'GTBATTLEGROUNDS',
  'BATTLEGROUNDS',
  '23'
])

const BG_HINT =
  /GameType=GT_?BATTLEGROUNDS\b|\btag=BACON_|\bBACON_IN_COMBAT|\bTB_BaconShop_|\bPLAYER_TECH_LEVEL\b|\bcardId=BG(?:_|DUO)/i

const NON_SOLO_BG = new Set([
  'GT_BATTLEGROUNDS_FRIENDLY',
  'GT_BATTLEGROUNDS_DUO',
  'GT_BATTLEGROUNDS_DUO_VS_AI',
  'GT_BATTLEGROUNDS_DUO_FRIENDLY',
  '24',
  '29',
  '30',
  '31'
])

export function isPlaceholderName(name: string): boolean {
  const n = normalizeName(name)
  if (PLACEHOLDER_NAMES.has(n)) return true
  if (/^player\s*\d+$/i.test(name.trim())) return true
  return false
}

export function normalizeName(name: string): string {
  return name.replace(/#\d+$/, '').trim().toLowerCase()
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isWarbandMinion(minion: SeenMinion): boolean {
  if (!minion.cardId && !minion.name) return false
  if (/^TB_BaconShop_/i.test(minion.cardId)) return false
  if (/Drag To Buy|Tavern Tier|Refresh|Buddy|Trinket/i.test(minion.name)) return false
  return true
}

export function seenFromCombat(minion: {
  cardId: string
  name: string
  attack: number
  health: number
  taunt?: boolean
  divineShield?: boolean
  reborn?: boolean
  venomous?: boolean
  poisonous?: boolean
  golden?: boolean
}): SeenMinion {
  return {
    cardId: minion.cardId,
    name: minion.name,
    attack: minion.attack,
    health: minion.health,
    taunt: Boolean(minion.taunt),
    divineShield: Boolean(minion.divineShield),
    reborn: Boolean(minion.reborn),
    venomous: Boolean(minion.venomous || minion.poisonous),
    golden: Boolean(minion.golden) || /_G$/i.test(minion.cardId)
  }
}

export interface ParseResult {
  match: MatchState
  completed: MatchFinish | null
  combatEvent: CombatEvent
  detectedSelfName: string | null
}

export function parsePowerLogTime(line: string): string | null {
  const m = line.match(/^[A-Z] (\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/)
  return m?.[1] ?? null
}

export function baconShopTurn(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.ceil(raw / 2)
}

/** Shop is Turn N; the fight after that shop is Combat N. */
export function baconPhaseLabel(rawTurn: number, inCombat: boolean, shopTurn = 0): string {
  if (inCombat) {
    const n = rawTurn > 0 ? Math.max(1, Math.floor(rawTurn / 2)) : shopTurn
    return n ? `Combat ${n}` : 'Combat'
  }
  const n = rawTurn > 0 ? Math.ceil(rawTurn / 2) : shopTurn
  return n ? `Turn ${n}` : 'Turn 1'
}

interface TrackedBuff {
  key: string
  label: string
  iconCardId: string
  attack: number
  health: number
  player: number
  zone: string
}

export class BattlegroundsParser {
  private match: MatchState = { ...EMPTY_MATCH, lobby: [], buffs: [] }
  private techByPlayer = new Map<number, number>()
  private placeByPlayer = new Map<number, number>()
  private entityToPlayer = new Map<number, number>()
  private entityCardId = new Map<number, string>()
  private entityName = new Map<number, string>()
  private playerHeroEntity = new Map<number, number>()
  private tribes = new Set<string>()
  private tribesFromGame = false
  private acceptingGameTribes = false
  private pendingBattlegrounds: boolean | null = null
  private selfBattleTag: string
  private finished = false
  private ignoreLobbyWrites = false
  private matchKey: string | null = null
  private boards = new BoardTracker()
  private heroLocked = false
  private bobPlayerIds = new Set<number>()
  private lastEntityId = 0
  private lastEntityIsGame = false
  private pendingSpectate = false
  private buffs = new Map<number, TrackedBuff>()
  private tagBuffs = emptyTagBuffs()

  constructor(selfBattleTag = '') {
    this.selfBattleTag = selfBattleTag
  }

  setSelfBattleTag(tag: string): void {
    this.selfBattleTag = tag
    this.resolveFriendly()
  }

  reset(): void {
    this.match = { ...EMPTY_MATCH, lobby: [], buffs: [] }
    this.techByPlayer.clear()
    this.placeByPlayer.clear()
    this.entityToPlayer.clear()
    this.entityCardId.clear()
    this.entityName.clear()
    this.playerHeroEntity.clear()
    this.tribes.clear()
    this.tribesFromGame = false
    this.acceptingGameTribes = false
    this.pendingBattlegrounds = null
    this.finished = false
    this.ignoreLobbyWrites = false
    this.matchKey = null
    this.heroLocked = false
    this.bobPlayerIds.clear()
    this.lastEntityId = 0
    this.lastEntityIsGame = false
    this.pendingSpectate = false
    this.buffs.clear()
    this.tagBuffs = emptyTagBuffs()
    this.boards.reset()
  }

  clearBetweenMatches(): void {
    this.reset()
    this.match.inBattlegrounds = true
  }

  getCombat(): CombatInput | null {
    const frozen = this.boards.getFrozen()
    if (!frozen) return null
    const gems = this.currentBuffs().find((buff) => buff.key === 'gems')
    return {
      friendly: {
        ...frozen.friendly,
        tavernTier: this.techByPlayer.get(frozen.friendly.playerId) ?? this.match.tavernTier ?? 1
      },
      opponent: {
        ...frozen.opponent,
        tavernTier: this.techByPlayer.get(frozen.opponent.playerId) ?? 1
      },
      gems: gems ? { attack: gems.attack, health: gems.health } : undefined
    }
  }

  getFriendlyBoard(): SeenMinion[] {
    const pid = this.match.friendlyPlayerId
    if (pid == null) return []
    return this.boards.snapshotMinions(pid).filter(isWarbandMinion).map(seenFromCombat)
  }

  /** Leave the live match when LoadingScreen returns to the Battlegrounds menu. */
  endLiveMatch(): MatchFinish | null {
    if (!this.match.gameActive) return null
    const spectating = this.match.spectating
    this.match.gameActive = false
    this.match.inCombat = false
    this.ignoreLobbyWrites = false
    if (this.finished) return null
    this.finished = true
    if (spectating) return null
    const place =
      this.match.friendlyPlayerId != null
        ? this.placeByPlayer.get(this.match.friendlyPlayerId) ?? this.match.placement
        : this.match.placement
    if (place && place > 0) {
      this.match.placement = place
      return { placement: place, turn: this.match.turn, matchKey: this.matchKey }
    }
    return null
  }

  getMatch(): MatchState {
    return {
      ...this.match,
      lobby: [...this.match.lobby],
      availableTribes: [...this.match.availableTribes],
      tribesComplete: this.tribesAreComplete(),
      buffs: this.currentBuffs()
    }
  }

  private tribesAreComplete(): boolean {
    if (this.tribesFromGame) return true
    const types = [...this.tribes].filter((tribe) => tribe !== 'Buddy')
    return types.length >= 5
  }

  feed(line: string): ParseResult {
    let completed: MatchFinish | null = null
    let combatEvent: CombatEvent = null
    let detectedSelfName: string | null = null
    const fromTaskList = line.includes('PowerTaskList.')

    if (fromTaskList) {
      const combatLine =
        this.match.inCombat ||
        this.ignoreLobbyWrites ||
        /tag=BACON_IN_COMBAT_PHASE\b|tag=1522\b|BACON_CURRENT_COMBAT_PLAYER_ID|tag=2989\b|tag=BACON_SUBSET_|tag=BACON_BUDDY|tag=CARDRACE\b|tag=PLAYER_ID\b|cardId=(?:BG\d+_HERO_|TB_BaconShop_HERO_)|CardID=(?:BG\d+_HERO_|TB_BaconShop_HERO_)/i.test(
          line
        )
      if (!combatLine) {
        return { match: this.getMatch(), completed: null, combatEvent: null, detectedSelfName: null }
      }
    }

    if (isBeginSpectating(line)) {
      this.pendingSpectate = true
      this.match.spectating = true
      if (this.match.gameActive && !this.finished) {
        this.finished = true
        this.match.gameActive = false
        this.match.inCombat = false
        this.ignoreLobbyWrites = false
        const place =
          this.match.friendlyPlayerId != null
            ? this.placeByPlayer.get(this.match.friendlyPlayerId) ?? this.match.placement
            : this.match.placement
        if (place && place > 0) {
          this.match.placement = place
          completed = { placement: place, turn: this.match.turn, matchKey: this.matchKey }
        }
      }
    }

    if (isEndSpectating(line)) {
      this.pendingSpectate = false
      this.match.spectating = false
      this.match.spectatedName = null
      this.match.gameActive = false
      this.match.inCombat = false
      this.ignoreLobbyWrites = false
      this.finished = true
    }

    if (line.includes('CREATE_GAME')) {
      if (this.pendingSpectate) {
        this.startNewMatch(line, true)
        combatEvent = 'end'
      } else if (this.match.inBattlegrounds && this.match.gameActive) {
        this.boards.reset()
        this.ignoreLobbyWrites = true
        this.match.inCombat = true
        this.acceptingGameTribes = !this.tribesFromGame
      } else {
        this.startNewMatch(line, false)
        combatEvent = 'end'
      }
    }

    const gameType = line.match(/GameType=([A-Z0-9_]+)/i)
    if (gameType) {
      const value = gameType[1].toUpperCase()
      if (NON_SOLO_BG.has(value) || (!BG_GAME_TYPES.has(value) && value.startsWith('GT_'))) {
        this.pendingBattlegrounds = false
        this.match.inBattlegrounds = false
        this.match.gameActive = false
      } else if (BG_GAME_TYPES.has(value)) {
        this.pendingBattlegrounds = true
        this.match.inBattlegrounds = true
        if (this.match.gameActive) this.seedFirstTurn()
      }
    }

    if (this.pendingBattlegrounds === false && !this.match.inBattlegrounds) {
      return { match: this.getMatch(), completed: null, combatEvent: null, detectedSelfName: null }
    }

    if (this.pendingBattlegrounds !== false && !this.match.inBattlegrounds && BG_HINT.test(line)) {
      this.pendingBattlegrounds = true
      this.match.inBattlegrounds = true
      this.match.gameActive = true
      this.seedFirstTurn()
    }

    const bobAccount = line.match(/PlayerID=(\d+)\s+GameAccountId=\[hi=0 lo=0\]/i)
    if (bobAccount) this.bobPlayerIds.add(Number(bobAccount[1]))

    const playerLine = line.match(/PlayerID=(\d+)\s*,\s*PlayerName=([^,\r\n]+)/)
    if (playerLine) {
      this.upsertPlayer(Number(playerLine[1]), playerLine[2].trim())
    }

    const playerEntity = parsePlayerEntity(payloadOf(line))
    if (playerEntity && !this.ignoreLobbyWrites) {
      this.entityToPlayer.set(playerEntity.entityId, playerEntity.playerId)
    }

    this.noteNestedEntity(line)
    if (!this.ignoreLobbyWrites) this.ingestEntityLine(line)
    if (!this.ignoreLobbyWrites) this.resolveFriendly()
    const handPlayer = this.boards.getDetectedHandPlayer()
    if (!this.ignoreLobbyWrites && handPlayer != null) {
      this.match.friendlyPlayerId = handPlayer
      this.refreshSpectatedName()
      const named = this.match.lobby.find((p) => p.playerId === handPlayer)
      if (!this.match.spectating && named && !isPlaceholderName(named.rawName)) {
        detectedSelfName = named.rawName
      }
    }

    const boardEvent = this.boards.feed(line, this.match.friendlyPlayerId, (id) => this.playerLabel(id))
    if (boardEvent) combatEvent = boardEvent

    const tag = parseTagChangeLine(line)
    if (tag) {
      const applied = this.applyMatchTag(tag, fromTaskList)
      if (applied.completed) completed = applied.completed
      if (applied.combatEvent) combatEvent = applied.combatEvent
    }

    return { match: this.getMatch(), completed, combatEvent, detectedSelfName }
  }

  private startNewMatch(line: string, spectating: boolean): void {
    this.reset()
    this.match.gameActive = true
    this.match.spectating = spectating
    this.matchKey = parsePowerLogTime(line)
    this.pendingBattlegrounds = null
  }

  private applyMatchTag(
    tag: {
      entityId?: number
      entityName?: string
      playerId?: number
      tag: string
      value: string
    },
    fromTaskList: boolean
  ): { completed: MatchFinish | null; combatEvent: CombatEvent } {
    let completed: MatchFinish | null = null
    let combatEvent: CombatEvent = null
    if (tag.tag === 'PLAYER_ID' && tag.entityId != null && !this.ignoreLobbyWrites) {
      const pid = Number(tag.value)
      if (Number.isFinite(pid)) {
        this.entityToPlayer.set(tag.entityId, pid)
        this.noteHeroPlayer(tag.entityId, pid)
      }
    }
    if (
      tag.tag === 'TURN' &&
      !this.ignoreLobbyWrites &&
      (tag.entityName === 'GameEntity' || tag.entityName === 'Game')
    ) {
      const turn = Number(tag.value)
      if (Number.isFinite(turn) && turn > 0) {
        this.match.rawTurn = turn
        this.match.turn = baconShopTurn(turn)
      }
    }
    if (tag.tag === 'PLAYER_TECH_LEVEL') {
      const heroCard = this.heroCardForTag(tag)
      if (!heroCard || !isBgHeroCardId(heroCard)) {
        const pid = this.playerIdFor(tag)
        const tier = Number(tag.value)
        const selfWrite = this.isSelfEntity(tag)
        if (pid != null && Number.isFinite(tier) && tier > 0 && (!this.ignoreLobbyWrites || selfWrite)) {
          if (!this.bobPlayerIds.has(pid)) this.techByPlayer.set(pid, tier)
          this.ensureLobbyPlayer(pid)
          this.refreshFriendlyStats()
        }
      }
    }
    if (tag.tag === 'PLAYER_LEADERBOARD_PLACE') {
      const pid = this.playerIdFor(tag)
      const place = Number(tag.value)
      const selfWrite = this.isSelfEntity(tag) || pid === this.match.friendlyPlayerId
      if (
        pid != null &&
        Number.isFinite(place) &&
        place > 0 &&
        !this.bobPlayerIds.has(pid) &&
        (!this.ignoreLobbyWrites || selfWrite)
      ) {
        this.placeByPlayer.set(pid, place)
        if (!this.ignoreLobbyWrites) this.ensureLobbyPlayer(pid)
        const row = this.match.lobby.find((p) => p.playerId === pid)
        if (row) row.place = place
        this.refreshFriendlyStats()
        if (selfWrite && place > 0 && !this.finished && !this.match.spectating) {
          this.match.placement = place
          if (place === 1) {
            this.finished = true
            this.match.gameActive = false
            completed = { placement: place, turn: this.match.turn, matchKey: this.matchKey }
          }
        }
      }
    }
    if (tag.tag === 'HERO_ENTITY' && !this.ignoreLobbyWrites && !this.match.inCombat) {
      const pid = this.playerIdFor(tag)
      const heroId = Number(tag.value)
      if (pid != null && Number.isFinite(heroId) && heroId > 0 && !this.bobPlayerIds.has(pid)) {
        const cardId = this.entityCardId.get(heroId)
        if (!cardId || isPickedBgHero(cardId)) {
          if (pid === this.match.friendlyPlayerId && this.heroLocked) {
            /* keep the locked pick */
          } else {
            this.playerHeroEntity.set(pid, heroId)
            this.ensureLobbyPlayer(pid)
            this.refreshFriendlyHero()
          }
        }
      }
    }
    const tribe = TRIBE_SUBSET_TAGS[tag.tag]
    if (tribe) {
      const fromGame = tag.entityName === 'GameEntity' || tag.entityName === 'Game'
      const allow = !this.ignoreLobbyWrites || (fromGame && this.acceptingGameTribes)
      if (allow) {
        if (tag.value === '1' || tag.value.toUpperCase() === 'TRUE') {
          this.tribes.add(tribe)
          if (fromGame && tribe !== 'Buddy') this.tribesFromGame = true
        } else if (fromGame) {
          this.tribes.delete(tribe)
        }
        this.match.availableTribes = sortTribes([...this.tribes])
      }
    }
    if (tag.tag === 'BACON_CURRENT_COMBAT_PLAYER_ID') {
      this.noteCombatPairing(tag)
    }
    if (tag.tag === 'BACON_IN_COMBAT_PHASE') {
      const on = tag.value === '1' || tag.value.toUpperCase() === 'TRUE'
      if (on) {
        this.match.inCombat = true
      } else if (fromTaskList) {
        this.match.inCombat = false
        this.ignoreLobbyWrites = false
        combatEvent = 'end'
      }
    }
    const playerStat = PLAYER_STAT_TAGS[tag.tag]
    if (playerStat && this.isSelfEntity(tag) && !this.match.inCombat && !this.ignoreLobbyWrites) {
      this.tagBuffs[playerStat.key][playerStat.stat] = Number(tag.value) || 0
    }
    if (tag.tag === 'ATK' || tag.tag === 'HEALTH' || tag.tag === 'TAG_SCRIPT_DATA_NUM_1' || tag.tag === 'TAG_SCRIPT_DATA_NUM_2') {
      this.noteBuffStat(tag)
    }
    if (tag.tag === 'ZONE' && tag.entityId != null) {
      const buff = this.buffs.get(tag.entityId)
      if (buff) buff.zone = tag.value.toUpperCase()
      const cardId = this.entityCardId.get(tag.entityId)
      const pid = this.entityToPlayer.get(tag.entityId) ?? tag.playerId
      if (
        cardId &&
        isPickedBgHero(cardId) &&
        pid != null &&
        tag.value.toUpperCase() === 'PLAY' &&
        !this.ignoreLobbyWrites &&
        !this.match.inCombat &&
        !(this.heroLocked && pid === this.match.friendlyPlayerId)
      ) {
        this.playerHeroEntity.set(pid, tag.entityId)
        this.refreshFriendlyHero()
      }
    }
    if (tag.tag === 'STATE' && isCompleteState(tag.value)) {
      if (this.ignoreLobbyWrites) {
        this.ignoreLobbyWrites = false
        if (!this.finished && !this.match.spectating) {
          const place =
            this.match.friendlyPlayerId != null
              ? this.placeByPlayer.get(this.match.friendlyPlayerId) ?? this.match.placement
              : this.match.placement
          if (place && place > 0) {
            this.finished = true
            this.match.gameActive = false
            this.match.placement = place
            completed = { placement: place, turn: this.match.turn, matchKey: this.matchKey }
          }
        }
      } else if (this.match.inBattlegrounds && !this.finished) {
        this.finished = true
        this.match.gameActive = false
        if (this.match.spectating) {
          this.match.spectating = false
          this.match.spectatedName = null
        } else {
          const place =
            this.match.friendlyPlayerId != null
              ? this.placeByPlayer.get(this.match.friendlyPlayerId) ?? this.match.placement
              : this.match.placement
          if (place && place > 0) {
            this.match.placement = place
            completed = { placement: place, turn: this.match.turn, matchKey: this.matchKey }
          }
        }
      }
    }
    return { completed, combatEvent }
  }

  private noteNestedEntity(line: string): void {
    const payload = payloadOf(line)
    const gameEntity = parseGameEntity(payload)
    if (gameEntity != null) {
      this.lastEntityId = gameEntity
      this.lastEntityIsGame = true
      if (!this.tribesFromGame) this.acceptingGameTribes = true
      return
    }
    const playerEnt = parsePlayerEntity(payload)
    if (playerEnt) {
      this.lastEntityId = playerEnt.entityId
      this.lastEntityIsGame = false
      this.acceptingGameTribes = false
      this.entityToPlayer.set(this.lastEntityId, playerEnt.playerId)
      return
    }
    const created = parseCreating(payload)
    if (created) {
      this.lastEntityId = created.id
      this.lastEntityIsGame = false
      this.acceptingGameTribes = false
      if (created.cardId) this.entityCardId.set(this.lastEntityId, created.cardId)
      return
    }
    const nested = parseNestedTag(payload)
    if (!nested || !this.lastEntityId) return
    const { tag, value } = nested
    if (tag === 'PLAYER_ID') {
      const pid = Number(value)
      if (Number.isFinite(pid)) {
        this.entityToPlayer.set(this.lastEntityId, pid)
        this.noteHeroPlayer(this.lastEntityId, pid)
      }
    }
    if (tag === 'CONTROLLER' && !this.entityToPlayer.has(this.lastEntityId)) {
      const pid = Number(value)
      if (Number.isFinite(pid)) this.entityToPlayer.set(this.lastEntityId, pid)
    }
    if (tag === 'ATK' || tag === 'HEALTH' || tag === 'TAG_SCRIPT_DATA_NUM_1' || tag === 'TAG_SCRIPT_DATA_NUM_2') {
      this.noteBuffStat({ entityId: this.lastEntityId, tag, value, playerId: this.entityToPlayer.get(this.lastEntityId) })
    }
    this.applyMatchTag(
      {
        entityId: this.lastEntityId,
        entityName: this.lastEntityIsGame ? 'GameEntity' : undefined,
        playerId: this.entityToPlayer.get(this.lastEntityId),
        tag,
        value
      },
      false
    )
  }

  private noteHeroPlayer(entityId: number, playerId: number): void {
    if (this.ignoreLobbyWrites || this.bobPlayerIds.has(playerId)) return
    const cardId = this.entityCardId.get(entityId)
    if (!cardId || !isPickedBgHero(cardId)) return
    this.ensureLobbyPlayer(playerId)
    const row = this.match.lobby.find((p) => p.playerId === playerId)
    if (!row) return
    if (!row.heroCardId || (!this.match.inCombat && !this.ignoreLobbyWrites)) row.heroCardId = cardId
    const name = this.entityName.get(entityId)
    if (name && (!row.heroName || row.heroName.startsWith('Player '))) row.heroName = name
  }

  private playerLabel(id: number): string {
    const row = this.match.lobby.find((p) => p.playerId === id)
    if (row && !isPlaceholderName(row.rawName) && !this.isHeroLabel(row.rawName)) {
      return row.rawName.replace(/#\d+$/, '')
    }
    return `Player ${id}`
  }

  private lobbyIdForName(raw: string): number | undefined {
    const key = normalizeName(raw)
    return this.match.lobby.find((p) => normalizeName(p.rawName) === key)?.playerId
  }

  /**
   * BACON_CURRENT_COMBAT_PLAYER_ID is “who this player is fighting.”
   * BG writes it for every pairing; last-write-wins from other tables is wrong.
   * Our tag value is the opponent’s lobby id. Their tag value is our id.
   */
  private noteCombatPairing(tag: { entityName?: string; value: string }): void {
    const id = Number(tag.value)
    if (!Number.isFinite(id) || id <= 0) return
    const selfId = this.match.friendlyPlayerId
    const name = tag.entityName
    const isGame = name === 'GameEntity' || name === 'Game'
    if (this.isSelfEntity(tag) && !this.bobPlayerIds.has(id) && id !== selfId) {
      const labeled = this.playerLabel(id)
      if (!labeled.startsWith('Player ')) this.boards.setCombatOpponent(id, labeled)
      else this.boards.setCombatOpponent(id)
      return
    }
    if (
      selfId != null &&
      id === selfId &&
      name &&
      !this.isSelfEntity(tag) &&
      !isGame &&
      !isPlaceholderName(name) &&
      !this.isHeroLabel(name)
    ) {
      const theirId = this.lobbyIdForName(name)
      const display = name.replace(/#\d+$/, '')
      if (theirId != null && !this.bobPlayerIds.has(theirId)) {
        this.boards.setCombatOpponent(theirId, display)
        this.upsertPlayer(theirId, name, true)
      } else {
        this.boards.setCombatOpponentName(display)
      }
      return
    }
    if (isGame && !this.bobPlayerIds.has(id) && id !== selfId) {
      this.boards.setCombatOpponent(id)
    }
  }

  private isHeroLabel(name: string): boolean {
    if (looksLikeHeroName(name)) return true
    const key = normalizeName(name)
    if (this.match.lobby.some((p) => p.heroName && normalizeName(p.heroName) === key)) return true
    for (const [entityId, entityName] of this.entityName) {
      if (normalizeName(entityName) !== key) continue
      const cardId = this.entityCardId.get(entityId)
      if (cardId && isBgHeroCardId(cardId)) return true
    }
    return false
  }

  private upsertPlayer(playerId: number, rawName: string, fromCombatTag = false): void {
    const name = rawName.replace(/^"/, '').replace(/"$/, '')
    if (this.bobPlayerIds.has(playerId)) return
    if (this.ignoreLobbyWrites && !fromCombatTag) return
    if (isPlaceholderName(name) || this.isHeroLabel(name)) return
    const existing = this.match.lobby.find((p) => p.playerId === playerId)
    if (existing) {
      existing.rawName = name
    } else {
      this.match.lobby.push({ playerId, rawName: name })
    }
    this.maybeMarkSpectating()
    this.resolveFriendly()
  }

  private ensureLobbyPlayer(pid: number): void {
    if (pid <= 0 || this.ignoreLobbyWrites || this.bobPlayerIds.has(pid)) return
    if (this.match.lobby.some((p) => p.playerId === pid)) return
    this.match.lobby.push({ playerId: pid, rawName: `Player ${pid}` })
  }

  private isSelfEntity(tag: { entityName?: string; playerId?: number }): boolean {
    if (tag.entityName) {
      const n = normalizeName(tag.entityName)
      if (this.selfBattleTag && n === normalizeName(this.selfBattleTag)) return true
      const friendly = this.match.lobby.find((p) => p.playerId === this.match.friendlyPlayerId)
      if (friendly && n === normalizeName(friendly.rawName)) return true
      if (this.match.spectatedName && n === normalizeName(this.match.spectatedName)) return true
    }
    if (this.match.friendlyPlayerId != null && tag.playerId === this.match.friendlyPlayerId) return true
    return false
  }

  private heroCardForTag(tag: { entityId?: number; playerId?: number }): string | undefined {
    if (tag.entityId != null) return this.entityCardId.get(tag.entityId)
    return undefined
  }

  private playerIdFor(tag: { entityId?: number; entityName?: string; playerId?: number }): number | null {
    if (tag.entityId != null && this.entityToPlayer.has(tag.entityId)) {
      return this.entityToPlayer.get(tag.entityId) ?? null
    }
    if (tag.entityName) {
      const byName = this.match.lobby.find(
        (p) => normalizeName(p.rawName) === normalizeName(tag.entityName!)
      )
      if (byName) return byName.playerId
      const asNum = Number(tag.entityName)
      if (Number.isFinite(asNum) && this.entityToPlayer.has(asNum)) {
        return this.entityToPlayer.get(asNum) ?? null
      }
    }
    if (tag.playerId != null && Number.isFinite(tag.playerId) && !this.bobPlayerIds.has(tag.playerId)) {
      const card = tag.entityId != null ? this.entityCardId.get(tag.entityId) : undefined
      if (card && isBgHeroCardId(card)) return this.entityToPlayer.get(tag.entityId ?? -1) ?? null
      return tag.playerId
    }
    return tag.entityId != null ? this.entityToPlayer.get(tag.entityId) ?? null : null
  }

  private maybeMarkSpectating(): void {
    if (this.ignoreLobbyWrites) return
    const self = normalizeName(this.selfBattleTag)
    if (!self) return
    const named = this.match.lobby.filter(
      (p) => !isPlaceholderName(p.rawName) && !this.bobPlayerIds.has(p.playerId)
    )
    if (named.some((p) => normalizeName(p.rawName) === self)) {
      if (this.pendingSpectate) return
      this.match.spectating = false
      this.match.spectatedName = null
      this.pendingSpectate = false
      return
    }
    if (this.match.spectating) {
      this.refreshSpectatedName()
      return
    }
  }

  private refreshSpectatedName(): void {
    if (!this.match.spectating) {
      this.match.spectatedName = null
      return
    }
    const pid = this.match.friendlyPlayerId
    const row =
      (pid != null ? this.match.lobby.find((p) => p.playerId === pid) : null) ??
      this.match.lobby.find((p) => !isPlaceholderName(p.rawName) && !this.bobPlayerIds.has(p.playerId))
    if (row && !isPlaceholderName(row.rawName)) {
      this.match.spectatedName = row.rawName.replace(/#\d+$/, '')
    }
  }

  private resolveFriendly(): void {
    const self = normalizeName(this.selfBattleTag)
    if (self) {
      const hit = this.match.lobby.find((p) => normalizeName(p.rawName) === self)
      if (hit) {
        this.match.friendlyPlayerId = hit.playerId
        if (!this.pendingSpectate) {
          this.match.spectating = false
          this.match.spectatedName = null
          this.pendingSpectate = false
        }
        this.refreshFriendlyStats()
        this.refreshFriendlyHero()
        return
      }
    }
    const known = this.match.lobby.some((p) => p.playerId === this.match.friendlyPlayerId)
    if (this.match.friendlyPlayerId != null && !known) this.match.friendlyPlayerId = null
    if (this.match.friendlyPlayerId == null) {
      const real = this.match.lobby.filter(
        (p) => !isPlaceholderName(p.rawName) && !this.bobPlayerIds.has(p.playerId)
      )
      if (real.length === 1 && /#\d+$/.test(real[0]?.rawName ?? '')) {
        this.match.friendlyPlayerId = real[0]?.playerId ?? null
      }
    }
    this.refreshFriendlyStats()
    this.refreshFriendlyHero()
    this.refreshSpectatedName()
  }

  private ingestEntityLine(line: string): void {
    const payload = payloadOf(line)
    let entityId = 0
    let cardId: string | undefined
    let name: string | undefined
    let zone: string | undefined
    let zonePos: string | undefined
    let player: number | undefined

    const created = parseCreating(payload)
    const updating = parseUpdating(payload)
    const tagChange = parseTagChangeLine(line)
    if (created) {
      entityId = created.id
      cardId = created.cardId
    } else if (updating?.ref) {
      const ref = parseEntityRef(updating.ref, updating.cardId)
      if (!ref) return
      entityId = ref.id
      cardId = ref.cardId
      name = ref.name
      zone = ref.zone
      zonePos = ref.zonePos != null ? String(ref.zonePos) : undefined
      player = ref.player
    } else if (updating?.id) {
      entityId = updating.id
      cardId = updating.cardId
    } else if (tagChange?.ref) {
      const ref = parseEntityRef(tagChange.ref)
      if (!ref) return
      entityId = ref.id
      cardId = ref.cardId
      name = ref.name
      zone = ref.zone
      zonePos = ref.zonePos != null ? String(ref.zonePos) : undefined
      player = ref.player
    } else {
      const idMatch = line.match(/\bid=(\d+)/i)
      if (!idMatch) return
      entityId = Number(idMatch[1])
      cardId = line.match(/\bCardID=([A-Za-z0-9_]+)/)?.[1] || line.match(/\bcardId=([A-Za-z0-9_]+)/)?.[1]
      name = parseEntityName(line)
      zone = line.match(/\bzone=([A-Z]+)/i)?.[1]?.toUpperCase()
      zonePos = line.match(/\bzonePos=(\d+)/i)?.[1]
      const playerMatch = line.match(/\bplayer=(\d+)/i)
      player = playerMatch ? Number(playerMatch[1]) : undefined
    }

    this.lastEntityId = entityId
    if (cardId) this.entityCardId.set(entityId, cardId)
    if (cardId && /_Buddy$/i.test(cardId) && !this.ignoreLobbyWrites) {
      this.tribes.add('Buddy')
      this.match.availableTribes = sortTribes([...this.tribes])
    }
    if (name && !/CHANGE_ENTITY/i.test(line)) this.entityName.set(entityId, name)
    const mapped = this.entityToPlayer.get(entityId)
    const pid = mapped ?? (player != null ? player : NaN)
    if (cardId && isPickedBgHero(cardId) && Number.isFinite(pid) && !this.bobPlayerIds.has(pid)) {
      if (zone === 'PLAY' && zonePos === '0' && !(this.heroLocked && pid === this.match.friendlyPlayerId) && !this.match.inCombat) {
        this.playerHeroEntity.set(pid, entityId)
      }
      this.noteHeroPlayer(entityId, pid)
    }
    if (cardId) {
      const kind = classifyPlayerBuff(cardId, name ?? this.entityName.get(entityId) ?? '')
      if (kind && Number.isFinite(pid)) {
        const prev = this.buffs.get(entityId)
        this.buffs.set(entityId, {
          ...kind,
          attack: prev?.attack ?? 0,
          health: prev?.health ?? 0,
          player: pid,
          zone: zone ?? prev?.zone ?? 'PLAY'
        })
      }
    }
    if (cardId || name) this.refreshFriendlyHero()
  }

  private noteBuffStat(tag: { entityId?: number; tag: string; value: string; playerId?: number }): void {
    const id = tag.entityId
    if (id == null) return
    let buff = this.buffs.get(id)
    if (!buff) {
      const cardId = this.entityCardId.get(id)
      const name = this.entityName.get(id)
      if (!cardId || !name) return
      const kind = classifyPlayerBuff(cardId, name)
      if (!kind) return
      const pid = this.entityToPlayer.get(id) ?? tag.playerId ?? 0
      buff = { ...kind, attack: 0, health: 0, player: pid, zone: 'PLAY' }
      this.buffs.set(id, buff)
    }
    const n = Number(tag.value) || 0
    if (tag.tag === 'ATK' || tag.tag === 'TAG_SCRIPT_DATA_NUM_1') buff.attack = n
    if (tag.tag === 'HEALTH' || tag.tag === 'TAG_SCRIPT_DATA_NUM_2') buff.health = n
  }

  private currentBuffs(): MatchBuff[] {
    const self = this.match.friendlyPlayerId
    const fromEnchant: MatchBuff[] = []
    for (const buff of this.buffs.values()) {
      if (self != null && buff.player !== self && buff.player > 0) continue
      if (buff.zone && buff.zone !== 'PLAY' && buff.zone !== '1') continue
      fromEnchant.push({
        key: buff.key,
        label: buff.label,
        attack: buff.attack,
        health: buff.health,
        iconCardId: buff.iconCardId
      })
    }
    const quilboarInLobby = this.match.availableTribes.includes('Quilboar')
    const fromTags = PLAYER_TAG_KEYS.map((key) =>
      playerTagBuff(key, this.tagBuffs[key].attack, this.tagBuffs[key].health, { quilboarInLobby })
    ).filter((buff): buff is NonNullable<typeof buff> => buff != null)
    return mergeBuffs([...fromEnchant, ...fromTags])
  }

  /** Hero select is still the first shop round; Power.log often has no TURN tag yet. */
  private seedFirstTurn(): void {
    if (this.match.rawTurn > 0 || this.match.turn > 0) return
    this.match.rawTurn = 1
    this.match.turn = 1
  }

  private refreshFriendlyHero(): void {
    if (this.heroLocked && this.match.heroCardId && isPickedBgHero(this.match.heroCardId)) return
    const pid = this.match.friendlyPlayerId
    if (pid == null) return
    const heroEntity = this.playerHeroEntity.get(pid)
    if (heroEntity == null) return
    const cardId = this.entityCardId.get(heroEntity)
    if (!cardId || !isPickedBgHero(cardId)) return
    this.match.heroCardId = cardId
    const fromLog = this.entityName.get(heroEntity)
    if (fromLog) this.match.heroName = fromLog
    this.heroLocked = true
  }

  private refreshFriendlyStats(): void {
    const pid = this.match.friendlyPlayerId
    if (pid == null) return
    const tier = this.techByPlayer.get(pid)
    if (tier) this.match.tavernTier = tier
    const place = this.placeByPlayer.get(pid)
    if (place) this.match.placement = place
  }
}

export function parseLoadingScreenScene(line: string): string | null {
  const m = line.match(/currMode=([A-Z0-9_]+)/i)
  return m ? m[1].toUpperCase() : null
}

export function isEndGameDisconnect(line: string): boolean {
  return /DisconnectFromGameServer\(\)\s*-\s*Reason:\s*EndGameScreen/i.test(line)
}

export function sceneFromMode(mode: string): import('./types').Scene {
  if (mode === 'BACON' || mode === 'BACONCOLLECTION') return 'bacon'
  if (mode === 'GAMEPLAY') return 'gameplay'
  if (mode === 'HUB' || mode === 'LOGIN' || mode === 'TOURNAMENTS') return 'hub'
  return 'other'
}

function isCompleteState(value: string): boolean {
  const v = value.toUpperCase()
  return v === 'COMPLETE' || v === '3' || v === '4'
}

function isBeginSpectating(line: string): boolean {
  return /Begin Spectating/i.test(line)
}

function isEndSpectating(line: string): boolean {
  return /End Spectator (?:Mode|Game)|End Spectating/i.test(line)
}

/** Catchup should skip combat spectator dumps, not joining or leaving spectator mode. */
export function isCombatSpectatorCreateGame(nearby: string): boolean {
  if (/Begin Spectating/i.test(nearby)) return false
  if (/End Spectator/i.test(nearby)) return false
  return /Spectator/i.test(nearby)
}

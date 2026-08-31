import type { ThemeId } from './theme'

export type Region = 'US' | 'EU' | 'AP'
export type { ThemeId } from './theme'

export type Scene = 'unknown' | 'hub' | 'bacon' | 'gameplay' | 'other'

export interface OverlayPos {
  x: number
  y: number
}

export interface OverlayLayout {
  rail: OverlayPos
  combat: OverlayPos
  pool: OverlayPos
}

export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = {
  rail: { x: 0.7, y: 6 },
  combat: { x: 29, y: 1.4 },
  pool: { x: 74, y: 3.5 }
}

export interface AppSettings {
  battleTag: string
  region: Region
  regionManual: boolean
  hearthstonePath: string
  hideWhenUnfocused: boolean
  overlayEnabled: boolean
  overlayOpacity: number
  layoutUnlocked: boolean
  keepFullscreenOverlay: boolean
  showSessionOnOverlay: boolean
  showLobbyOnOverlay: boolean
  overlayLayout: OverlayLayout
  currentMmr: number | null
  theme: ThemeId
}

export const DEFAULT_SETTINGS: AppSettings = {
  battleTag: '',
  region: 'US',
  regionManual: false,
  hearthstonePath: '',
  hideWhenUnfocused: true,
  overlayEnabled: true,
  overlayOpacity: 96,
  layoutUnlocked: false,
  keepFullscreenOverlay: true,
  showSessionOnOverlay: true,
  showLobbyOnOverlay: false,
  overlayLayout: DEFAULT_OVERLAY_LAYOUT,
  currentMmr: null,
  theme: 'ember'
}

export interface LobbyPlayer {
  playerId: number
  rawName: string
  heroName?: string | null
  heroCardId?: string | null
  place?: number | null
  entityId?: number
}

export interface MatchBuff {
  key: string
  label: string
  attack: number
  health: number
  iconCardId: string
}

export interface MatchState {
  inBattlegrounds: boolean
  gameActive: boolean
  inCombat: boolean
  spectating: boolean
  spectatedName: string | null
  turn: number
  rawTurn: number
  tavernTier: number
  placement: number | null
  lobby: LobbyPlayer[]
  friendlyPlayerId: number | null
  heroCardId: string | null
  heroName: string | null
  availableTribes: string[]
  tribesComplete: boolean
  buffs: MatchBuff[]
}

export const EMPTY_MATCH: MatchState = {
  inBattlegrounds: false,
  gameActive: false,
  inCombat: false,
  spectating: false,
  spectatedName: null,
  turn: 0,
  rawTurn: 0,
  tavernTier: 1,
  placement: null,
  lobby: [],
  friendlyPlayerId: null,
  heroCardId: null,
  heroName: null,
  availableTribes: [],
  tribesComplete: false,
  buffs: []
}

export interface SeenMinion {
  cardId: string
  name: string
  attack: number
  health: number
  taunt?: boolean
  divineShield?: boolean
  reborn?: boolean
  venomous?: boolean
  golden?: boolean
}

export interface SeenBoard {
  playerId: number
  name: string
  turn: number
  minions: SeenMinion[]
}

export interface MatchFinish {
  placement: number
  turn: number
  matchKey: string | null
}

export interface SessionGame {
  endedAt: string
  placement: number
  turn: number
  matchKey?: string | null
  heroName?: string | null
  heroCardId?: string | null
  mmrBefore?: number | null
  mmrAfter?: number | null
  mmrDelta?: number | null
  mmrEstimated?: boolean
  board?: SeenMinion[]
}

export interface SessionState {
  date: string
  games: SessionGame[]
  startMmr: number | null
}

export interface LeaderboardEntry {
  accountid: string
  rating: number
  rank: number
}

export interface LobbyMmrRow {
  playerId: number
  name: string
  isSelf: boolean
  rating: number | null
  rank: number | null
  unknownName: boolean
  belowCutoff: boolean
  heroName?: string | null
  heroCardId?: string | null
  place?: number | null
}

export interface BgMinion {
  id: string
  dbfId: number
  name: string
  text: string
  attack: number
  health: number
  techLevel: number
  tribes: string[]
  tileUrl: string
  goldenId: string | null
  kind: 'minion' | 'spell' | 'buddy' | 'trinket'
  cost: number
  mechanics?: string[]
}

export type OverlayDisplayMode = 'unknown' | 'windowed' | 'borderless' | 'exclusive'

export interface TrackerStatus {
  hearthstoneFound: boolean
  hearthstoneFocused: boolean
  installPath: string | null
  logsDirectory: string | null
  logsLive: boolean
  logConfigChanged: boolean
  needsHearthstoneRestart: boolean
  banner: string | null
  lastError: string | null
  leaderboardReady: boolean
  leaderboardCount: number
  cardsReady: boolean
  cardCount: number
  cardsError: string | null
  displayMode: OverlayDisplayMode
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'unavailable'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  availableVersion: string | null
  progress: number
  dismissed: boolean
  canInstall: boolean
  errorMessage: string | null
}

export const DEFAULT_UPDATE: UpdateState = {
  phase: 'idle',
  currentVersion: '0.0.0',
  availableVersion: null,
  progress: 0,
  dismissed: false,
  canInstall: false,
  errorMessage: null
}

export interface CombatOdds {
  active: boolean
  simulating: boolean
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
  opponentName: string | null
  opponentPlayerId: number | null
  partial: boolean
}

export const EMPTY_COMBAT: CombatOdds = {
  active: false,
  simulating: false,
  samples: 0,
  lethal: 0,
  win: 0,
  tie: 0,
  loss: 0,
  died: 0,
  dealtMin: 0,
  dealtMax: 0,
  takenMin: 0,
  takenMax: 0,
  opponentName: null,
  opponentPlayerId: null,
  partial: false
}

export interface OverlaySnapshot {
  settings: AppSettings
  status: TrackerStatus
  match: MatchState
  session: SessionState
  lobbyMmr: LobbyMmrRow[]
  lastBoards: SeenBoard[]
  selfPublicMmr: number | null
  minions: BgMinion[]
  selectedTier: number
  overlayVisible: boolean
  update: UpdateState
  combat: CombatOdds
  strategies: StrategyCompView[]
}

export interface StrategyCompView {
  id: string
  name: string
  tribes: string[]
  mechanic: string | null
  status: 'candidate' | 'curated' | 'stale'
  core: Array<{ id: string; name: string; techLevel: number }>
  essential: Array<{ id: string; name: string; techLevel: number; role: string }>
  phases: Array<{
    stage: 'early' | 'mid' | 'end'
    tiers: string
    goal: string
    cards: Array<{ id: string; name: string; techLevel: number }>
  }>
  why?: string
  commitWhen?: string
  notes?: string
}

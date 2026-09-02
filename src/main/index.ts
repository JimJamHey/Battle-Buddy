import { existsSync } from 'node:fs'
import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
  Tray
} from 'electron'
import {
  BattlegroundsParser,
  ensureWindowedGraphics,
  indexLeaderboard,
  leaderboardAccountId,
  matchLobby,
  mergeLogConfig,
  trackerBanner,
  normalizeName,
  resolveLogsDirectory,
  parseLoadingScreenScene,
  applyGameMmr,
  acceptObservedRating,
  applyRatingObservation,
  isSessionTotalDelta,
  gameMmrIsSettled,
  bindCurrentMmr,
  gamesToday,
  ensureToday,
  recordFinish,
  sceneFromMode,
  shouldPollRating,
  ratingPollMode,
  ratingPollIntervalMs,
  isMenuScene,
  shouldHideOverlayForRating,
  ratingMenuSynced,
  isEndGameDisconnect,
  simulateCombat,
  enrichCombatInput,
  combatInputHasGaps,
  combatInputNeedsHandOcr,
  combatInputNeedsHandStatOcr,
  mergeHandOcr,
  COMBAT_QUICK_SAMPLES,
  COMBAT_FULL_SAMPLES,
  strategyCatalog,
  curatedStrategies,
  sanitizeSettings,
  sanitizeTier,
  type AppSettings,
  type BgMinion,
  type CombatInput,
  type CombatOdds,
  type LeaderboardEntry,
  type LobbyMmrRow,
  type MatchFinish,
  type MatchState,
  type OverlayDisplayMode,
  type OverlaySnapshot,
  type SeenBoard,
  type SeenMinion,
  type OpponentCombatShot,
  type SessionState,
  type StrategyCompView,
  type TrackerStatus,
  type BootstrapStatus,
  type RatingOcrStatus,
  type Scene,
  EMPTY_COMBAT,
  EMPTY_MATCH,
  LOADING_BOOTSTRAP,
  baseCardId,
  isWarbandMinion,
  seenFromCombat,
  opponentCombatCaptureRect
} from '../core/index'
import { createGameHost, pinOverlayToGame, followGameWindow, isOverlayForeground, ensureGameOverlayFriendly } from '../platform/index'
import { detectBattleNetRegion } from '../platform/battleNet'
import { loadCardCatalog, readCachedCardCatalog } from './cards'
import { appIcon } from './icon'
import { buildSummonPools } from '../core/combatSummonPools'
import { captureOpponentBoardDataUrl } from './combatShot'
import { readCombatHandsFromScreen } from './combatOcr'
import { cacheTimestamp, loadLeaderboardCache, refreshLeaderboard } from './leaderboard'
import { LogTailer } from './logTailer'
import { readRatingObservation, cleanupOcrTemps } from './playRatingOcr'
import { loadSession, loadSettings, saveSession, saveSettings } from './persist'
import { AppUpdater } from './updater'
import { releasePageUrl } from '../core/release'

const __dirname = dirname(fileURLToPath(import.meta.url))

const host = createGameHost()

let settingsWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let settings: AppSettings
let session: SessionState
let match: MatchState = { ...EMPTY_MATCH, lobby: [] }
let minions: BgMinion[] = []
let heroNames: Record<string, string> = {}
let summons: Record<string, { attack: number; health: number; count: number }> = {}
let combat: CombatOdds = { ...EMPTY_COMBAT }
let lastCombatKey = ''
let simGen = 0
let combatSnapshotFlight: Promise<void> = Promise.resolve()
let lastBoards: SeenBoard[] = []
let lastOpponentShot: OpponentCombatShot | null = null
let lastFriendlyBoard: SeenMinion[] = []
let matchStartMmr: number | null = null
let recordedThisMatch = false
let playedAsSelf = false
let logCatchup = false
let playRatingBusy = false
let lastPlayRatingAt = 0
let combatShotTimer: NodeJS.Timeout | null = null
let combatShotGen = 0
let mmrPollTimer: NodeJS.Timeout | null = null
let awaitingPostGameMmr = false
let postGameAt = 0
let ratingOcrFailed = false
let currentScene: Scene = 'unknown'
const SETTLEMENT_MAX_MS = 5 * 60 * 1000
const EMPTY_RATING_OCR: RatingOcrStatus = {
  at: null,
  raw: null,
  rating: null,
  delta: null,
  error: null,
  failed: false,
  debugCropPath: null
}
let ratingOcr: RatingOcrStatus = { ...EMPTY_RATING_OCR }
let boardRows: LeaderboardEntry[] = []
let selectedTier = 0
let clickThrough = true
let clickThroughTimer: NodeJS.Timeout | null = null
let parser = new BattlegroundsParser()
let tailer: LogTailer | null = null
let currentLogsDir: string | null = null
let logConfigChanged = false
let lastError: string | null = null
let hsFound = false
let hsFocused = false
let lastBoundsKey = ''
let lastSizeKey = ''
let lastPinAt = 0
let overlayTickBusy = false
let appStartedAt = 0
let bootstrap: BootstrapStatus = { ...LOADING_BOOTSTRAP }
const STARTUP_GRACE_MS = 12_000
const LOG_ATTACH_DELAY_MS = 10_000
let hsWasFound = false
let displayMode: OverlayDisplayMode = 'unknown'
let lastBroadcastMode: OverlayDisplayMode = 'unknown'
let lastDisplayCheck = 0
let leaderboardRefreshing = false
let lastInstallCheck = 0
let cachedInstallPath: string | null = null
let logsAttached = false
let logsAttachTimer: NodeJS.Timeout | null = null
let overlayTickTimer: NodeJS.Timeout | null = null
let cachedStrategies: StrategyCompView[] = []
let strategiesKey = ''
let updater: AppUpdater

function setBootstrap(patch: Partial<BootstrapStatus>): void {
  bootstrap = { ...bootstrap, ...patch }
  scheduleBroadcast()
}

function strategiesForSnapshot(): StrategyCompView[] {
  if (bootstrap.phase !== 'ready' || !minions.length) return []
  const tribes = match.gameActive ? match.availableTribes : []
  const key = `${minions.length}|${tribes.join(',')}|${match.gameActive}`
  if (key === strategiesKey) return cachedStrategies
  strategiesKey = key
  cachedStrategies = strategyCatalog(minions, tribes, curatedStrategies).map((row) => ({
    id: row.id,
    name: row.name,
    tribes: row.tribes,
    mechanic: row.mechanic,
    status: row.status,
    inLobby: row.inLobby,
    core: row.core,
    essential: row.essential,
    why: row.why,
    notes: row.notes
  }))
  return cachedStrategies
}

function applyCardCatalog(catalog: {
  minions: BgMinion[]
  heroes: Record<string, string>
  summons: Record<string, { attack: number; health: number; count: number }>
}): void {
  minions = catalog.minions
  heroNames = catalog.heroes
  summons = catalog.summons
  strategiesKey = ''
  scheduleBroadcast()
}

function userData(): string {
  return app.getPath('userData')
}

function isDev(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL)
}

function rendererUrl(hash: string): { url?: string; file?: string; hash: string } {
  if (isDev()) {
    return { url: `${process.env.ELECTRON_RENDERER_URL}#/${hash}`, hash }
  }
  return {
    file: join(__dirname, '../renderer/index.html'),
    hash
  }
}

function loadWindow(win: BrowserWindow, hash: string): void {
  const target = rendererUrl(hash)
  if (target.url) {
    void win.loadURL(target.url)
  } else if (target.file) {
    void win.loadFile(target.file, { hash: `/${hash}` })
  }
}

function status(): TrackerStatus {
  const logsLive = Boolean(tailer?.isLive())
  const needsHearthstoneRestart = logConfigChanged && hsFound && !logsLive
  return {
    hearthstoneFound: hsFound,
    hearthstoneFocused: hsFocused,
    installPath: settings.hearthstonePath || host.defaultInstallPath(),
    logsDirectory: currentLogsDir,
    logsLive,
    logConfigChanged,
    needsHearthstoneRestart,
    banner: trackerBanner({ hearthstoneFound: hsFound, needsHearthstoneRestart }),
    lastError,
    leaderboardReady: boardRows.length > 0,
    leaderboardCount: boardRows.length,
    cardsReady: minions.length > 0,
    cardCount: minions.length,
    cardsError: minions.length ? null : lastError,
    displayMode,
    ratingOcr: { ...ratingOcr, failed: ratingOcrFailed },
    appDataPath: userData()
  }
}

function selfPublicRating(): number | null {
  const tag = leaderboardAccountId(settings.battleTag)
  if (!tag) return null
  return indexLeaderboard(boardRows).get(normalizeName(tag))?.rating ?? null
}

function displayMmr(): number | null {
  return settings.currentMmr ?? session.games.at(-1)?.mmrAfter ?? null
}

function lobbyMmr(): LobbyMmrRow[] {
  if (!match.gameActive || !match.lobby.length) return []
  return matchLobby(match.lobby, indexLeaderboard(boardRows), settings.battleTag, {
    spectating: match.spectating,
    watchedPlayerId: match.friendlyPlayerId,
    heroNames
  })
}

function captureStartMmr(): void {
  if (session.startMmr != null) return
  const firstBefore = gamesToday(session)[0]?.mmrBefore
  if (firstBefore != null) {
    session = { ...session, startMmr: firstBefore }
    void saveSession(userData(), session)
    return
  }
  const rating = displayMmr()
  if (rating == null) return
  session = { ...session, startMmr: rating }
  void saveSession(userData(), session)
}

function noteObservedRating(
  observation: { rating: number | null; delta: number | null },
  opts?: { settled?: boolean }
): void {
  const onMenu = !match.gameActive && isMenuScene(currentScene)
  let rating = observation.rating
  let delta = observation.delta
  if (awaitingPostGameMmr && rating == null && delta != null) {
    const before = session.games.at(-1)?.mmrBefore
    if (before != null) {
      const derived = before + delta
      if (
        acceptObservedRating(derived, {
          previous: settings.currentMmr ?? before,
          battleTag: settings.battleTag,
          resync: true
        })
      ) {
        rating = derived
      }
    }
  }
  observation = { rating, delta }
  const previousRating = settings.currentMmr ?? session.games.at(-1)?.mmrAfter ?? null
  if (
    rating != null &&
    !(onMenu && rating >= 1000 && rating <= 30000) &&
    !acceptObservedRating(rating, {
      previous: previousRating,
      battleTag: settings.battleTag,
      resync: onMenu || awaitingPostGameMmr
    })
  ) {
    rating = null
    observation = { ...observation, rating: null }
  }
  if (observation.delta != null && isSessionTotalDelta(observation.delta, session)) {
    observation = { ...observation, delta: null }
  }
  const echo = settings.currentMmr ?? session.games.at(-1)?.mmrBefore ?? session.startMmr
  const before = session.games.at(-1)?.mmrBefore
  if (
    awaitingPostGameMmr &&
    observation.rating != null &&
    observation.rating === echo &&
    (observation.delta == null || (before != null && observation.rating !== before + observation.delta))
  ) {
    observation = { rating: null, delta: observation.delta }
  }
  let changed = false
  if (rating != null && settings.currentMmr !== rating) {
    settings = { ...settings, currentMmr: rating }
    void saveSettings(userData(), settings)
    changed = true
  }
  if (rating != null && !match.gameActive && gamesToday(session).length === 0 && session.startMmr !== rating) {
    session = { ...session, startMmr: rating }
    changed = true
  }
  const next = applyRatingObservation(session, observation, opts)
  if (next !== session) {
    session = next
    const last = session.games.at(-1)
    if (session.startMmr == null && last?.mmrBefore != null) {
      session = { ...session, startMmr: last.mmrBefore }
    }
    void saveSession(userData(), session)
    changed = true
  } else if (rating != null && session.startMmr == null && gamesToday(session).length === 0) {
    session = { ...session, startMmr: rating }
    void saveSession(userData(), session)
    changed = true
  }
  if (rating != null) {
    const aligned = bindCurrentMmr(session, settings.currentMmr)
    if (aligned !== session) {
      session = aligned
      void saveSession(userData(), session)
      changed = true
    }
  }
  if (changed) scheduleBroadcast()
}

function lastSessionGame() {
  return session.games.at(-1) ?? null
}

function lastGameSettled(): boolean {
  const last = lastSessionGame()
  return last ? gameMmrIsSettled(last) : true
}

function ratingPollContext() {
  const last = lastSessionGame()
  return {
    hsFound,
    logCatchup,
    gameActive: match.gameActive,
    scene: currentScene,
    awaitingPostGameMmr,
    placement: match.placement,
    playedAsSelf,
    lastGameSettled: last ? gameMmrIsSettled(last) : true,
    hasLastGame: Boolean(last),
    menuRatingSynced: ratingMenuSynced(settings.currentMmr, ratingOcr.rating, ratingOcr.at)
  }
}

function noteRatingOcrCapture(
  capture: { rawText: string; error: string | null; debugCropPath: string | null },
  observation: { rating: number | null; delta: number | null }
): void {
  ratingOcr = {
    at: Date.now(),
    raw: capture.rawText.trim().slice(0, 400) || null,
    rating: observation.rating,
    delta: observation.delta,
    error: capture.error,
    failed: ratingOcrFailed,
    debugCropPath: capture.debugCropPath
  }
}

async function withOverlayHiddenForOcr<T>(
  hideOverlay: boolean,
  hidePool: boolean,
  fn: () => Promise<T>
): Promise<T> {
  const win = overlayWindow
  const wasVisible = Boolean(win && !win.isDestroyed() && win.isVisible())
  try {
    if (hideOverlay && wasVisible && win && !win.isDestroyed()) win.hide()
    else if (hidePool && win && !win.isDestroyed()) {
      win.webContents.send('ocr-capture', true)
      await new Promise((resolve) => setTimeout(resolve, 48))
    }
    return await fn()
  } finally {
    if (hidePool && win && !win.isDestroyed()) win.webContents.send('ocr-capture', false)
    if (hideOverlay && wasVisible && win && !win.isDestroyed()) win.showInactive()
  }
}

async function pollPlayRating(force = false): Promise<void> {
  if ((process.platform !== 'win32' && process.platform !== 'darwin') || playRatingBusy) return
  const ctx = ratingPollContext()
  if (!shouldPollRating(ctx)) return
  const mode = ratingPollMode({
    awaitingPostGameMmr,
    lastGameSettled: ctx.lastGameSettled,
    hasLastGame: ctx.hasLastGame
  })
  const wantResults =
    mode === 'postgame' ||
    Boolean(playedAsSelf && match.placement && match.placement > 0 && match.gameActive)
  const now = Date.now()
  const minGap = ratingPollIntervalMs(mode)
  if (!force && now - lastPlayRatingAt < minGap) return
  // Background menu polling hid the pool every few seconds and caused visible flicker.
  if (mode === 'idle' && !force) return
  lastPlayRatingAt = now
  const bounds = await host.getClientBounds()
  if (!bounds) {
    ratingOcr = {
      ...ratingOcr,
      at: now,
      error: 'Could not read the Hearthstone window bounds',
      failed: ratingOcrFailed
    }
    return
  }
  playRatingBusy = true
  const hideOverlay = shouldHideOverlayForRating(mode)
  const hidePool = mode === 'idle' && force
  try {
    const capture = await withOverlayHiddenForOcr(hideOverlay, hidePool, () =>
      readRatingObservation(bounds, {
        includeResults: wantResults,
        debugDir: join(userData(), 'rating-ocr')
      })
    )
    const observed = capture.observation
    noteRatingOcrCapture(capture, observed)
    const place = observed.placement ?? match.placement
    if (
      playedAsSelf &&
      !recordedThisMatch &&
      !logCatchup &&
      place &&
      place > 0 &&
      (observed.rating != null || observed.delta != null || observed.placement != null)
    ) {
      if (observed.placement && !match.placement) match = { ...match, placement: observed.placement }
      recordCompleted({
        placement: place,
        turn: match.turn,
        matchKey: null
      })
    }
    const settled = mode === 'postgame' && now - postGameAt > 12_000
    if (observed.rating != null || observed.delta != null) {
      noteObservedRating(observed, { settled })
      if (lastGameSettled()) {
        ratingOcrFailed = false
        awaitingPostGameMmr = false
      }
    }
  } catch (err) {
    ratingOcr = {
      ...ratingOcr,
      at: Date.now(),
      error: err instanceof Error ? err.message : String(err),
      failed: ratingOcrFailed
    }
  } finally {
    playRatingBusy = false
  }
}

function snapshot(): OverlaySnapshot {
  const rolled = ensureToday(session)
  if (rolled !== session) {
    session = rolled
    void saveSession(userData(), session)
  }
  const st = status()
  captureStartMmr()
  const overlayVisible =
    settings.overlayEnabled && hsFound && (!settings.hideWhenUnfocused || hsFocused)
  const heroName =
    match.heroName ||
    (match.heroCardId
      ? heroNames[match.heroCardId] ?? heroNames[baseCardId(match.heroCardId)] ?? null
      : null)
  if (!match.gameActive && combat.active) {
    combat = { ...EMPTY_COMBAT }
    lastCombatKey = ''
  }
  return {
    bootstrap,
    settings,
    status: st,
    match: {
      ...match,
      lobby: [...match.lobby],
      availableTribes: [...match.availableTribes],
      tribesComplete: Boolean(match.tribesComplete),
      heroName,
      buffs: [...(match.buffs ?? [])]
    },
    session,
    lobbyMmr: lobbyMmr(),
    lastBoards,
    lastOpponentShot,
    selfPublicMmr: selfPublicRating(),
    minions,
    selectedTier,
    overlayVisible,
    update: updater?.state ?? {
      phase: 'idle',
      currentVersion: app.getVersion(),
      availableVersion: null,
      progress: 0,
      dismissed: false,
      canInstall: app.isPackaged,
      errorMessage: null
    },
    combat: match.gameActive ? combat : { ...EMPTY_COMBAT },
    strategies: strategiesForSnapshot()
  }
}

function broadcast(): void {
  const snap = snapshot()
  for (const win of [settingsWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('state', snap)
  }
}

let broadcastTimer: NodeJS.Timeout | null = null
function scheduleBroadcast(): void {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    broadcast()
  }, 40)
}

async function ensureWindowedOptions(): Promise<void> {
  // Hearthstone rewrites options.txt on exit. Only persist while the process is gone.
  if (await host.findHearthstone()) return
  const path = join(dirname(host.logConfigPath()), 'options.txt')
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    existing = ''
  }
  const { next, changed } = ensureWindowedGraphics(existing)
  if (!changed) return
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, next, 'utf8')
}

async function powerLogAlreadyVerbose(): Promise<boolean> {
  const install = settings.hearthstonePath || host.defaultInstallPath()
  if (!install) return false
  const logsDir = resolveLogsDirectory(install) ?? join(install, 'Logs')
  return powerFileHasDebugPrint(join(logsDir, 'Power.log'))
}

async function powerFileHasDebugPrint(path: string): Promise<boolean> {
  try {
    const st = await stat(path)
    if (st.size < 80) return false
    const fh = await open(path, 'r')
    try {
      const start = Math.max(0, st.size - 65_536)
      const buf = Buffer.alloc(st.size - start)
      await fh.read(buf, 0, buf.length, start)
      return buf.toString('utf8').includes('DebugPrintPower')
    } finally {
      await fh.close()
    }
  } catch {
    return false
  }
}

async function ensureLogConfig(): Promise<void> {
  const path = host.logConfigPath()
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    existing = ''
  }
  const { next, changed } = mergeLogConfig(existing)
  if (changed) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, next, 'utf8')
    const hsAlready = Boolean(await host.findHearthstone())
    const alreadyLive = await powerLogAlreadyVerbose()
    logConfigChanged = hsAlready && !alreadyLive
  }
}

async function resolveInstall(): Promise<string | null> {
  if (settings.hearthstonePath && existsSync(settings.hearthstonePath)) {
    cachedInstallPath = settings.hearthstonePath
    return settings.hearthstonePath
  }
  const now = Date.now()
  if (cachedInstallPath && existsSync(cachedInstallPath) && now - lastInstallCheck < 5000) {
    return cachedInstallPath
  }
  lastInstallCheck = now
  const candidates: string[] = []
  try {
    const fromProc = await host.findInstallFromRunningProcess()
    if (fromProc) candidates.push(fromProc)
  } catch {
    /* ignore */
  }
  const def = host.defaultInstallPath()
  if (def) candidates.push(def)
  for (const dir of candidates) {
    if (existsSync(dir)) {
      cachedInstallPath = dir
      return dir
    }
  }
  cachedInstallPath = candidates[0] ?? null
  return cachedInstallPath
}

function bindTailer(): LogTailer {
  return new LogTailer(
    (line) => {
      const wasActive = match.gameActive
      const result = parser.feed(line)
      match = result.match
      if (match.gameActive && !wasActive) {
        selectedTier = 0
        lastBoards = []
        lastOpponentShot = null
        lastFriendlyBoard = []
        combatShotGen += 1
        if (combatShotTimer) {
          clearTimeout(combatShotTimer)
          combatShotTimer = null
        }
        matchStartMmr = displayMmr()
        recordedThisMatch = false
        playedAsSelf = !match.spectating
        awaitingPostGameMmr = false
      }
      if (result.detectedSelfName && !match.spectating) {
        const tag = leaderboardAccountId(result.detectedSelfName)
        if (tag && normalizeName(tag) !== normalizeName(leaderboardAccountId(settings.battleTag))) {
          settings = { ...settings, battleTag: tag }
          parser.setSelfBattleTag(tag)
          void saveSettings(userData(), settings)
        }
      }
      if (
        (result.combatEvent === 'start' || result.combatEvent === 'update') &&
        match.inCombat
      ) {
        enqueueCombatSnapshot(result.combatEvent === 'start' && parser.isCombatSnapshotLocked())
      }
      if (result.combatEvent === 'end' || !match.inCombat) {
        if (combat.active || combat.simulating) {
          combat = { ...EMPTY_COMBAT }
          lastCombatKey = ''
          simGen += 1
        }
      }
      if (result.completed && !logCatchup && playedAsSelf) recordCompleted(result.completed)
      if (!match.gameActive && combat.active) {
        combat = { ...EMPTY_COMBAT }
        lastCombatKey = ''
      }
      if (!logCatchup) scheduleBroadcast()
    },
    (line) => {
      if (logCatchup) return
      const mode = parseLoadingScreenScene(line)
      if (!mode) return
      const scene = sceneFromMode(mode)
      currentScene = scene
      if (scene === 'gameplay') return
      if (scene === 'bacon' || scene === 'hub') {
        leaveMatchToMenu(scene === 'hub')
        void pollPlayRating(true)
      }
    },
    (line) => {
      if (!isEndGameDisconnect(line) || logCatchup || match.spectating) return
      if (!recordedThisMatch && match.placement && match.placement > 0) {
        recordCompleted({ placement: match.placement, turn: match.turn, matchKey: null })
      } else {
        beginPostGameMmr()
      }
    }
  )
}

async function tryAttachLogs(): Promise<void> {
  if (logsAttached || bootstrap.phase !== 'ready') return
  if (Date.now() - appStartedAt < LOG_ATTACH_DELAY_MS) return
  const install = await resolveInstall()
  if (install && install !== settings.hearthstonePath && existsSync(install)) {
    settings = { ...settings, hearthstonePath: install }
    void saveSettings(userData(), settings)
  }
  if (!install) return
  await attachLogs(install)
  if (tailer && !tailer.stopped) {
    logsAttached = true
    if (logsAttachTimer) {
      clearInterval(logsAttachTimer)
      logsAttachTimer = null
    }
  }
}

function scheduleLogAttach(): void {
  if (logsAttachTimer) return
  const attempt = () => void tryAttachLogs()
  setTimeout(attempt, LOG_ATTACH_DELAY_MS)
  logsAttachTimer = setInterval(attempt, 5000)
}

function startOverlayTick(): void {
  if (overlayTickTimer) return
  const interval = process.platform === 'darwin' ? 250 : 200
  overlayTickTimer = setInterval(() => {
    void tickOverlay()
  }, interval)
  void tickOverlay()
}

function ensureOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) return
  overlayWindow = createOverlayWindow()
  applyClickThrough(true)
  startOverlayTick()
}

let attachLogsChain = Promise.resolve()

async function attachLogs(install: string): Promise<void> {
  const run = async (): Promise<void> => {
    const logsDir = resolveLogsDirectory(install) ?? join(install, 'Logs')
    if (currentLogsDir === logsDir && tailer && !tailer.stopped) return
    if (!existsSync(logsDir)) {
      currentLogsDir = logsDir
      await tailer?.stop()
      scheduleBroadcast()
      return
    }
    const keepParser = Boolean(match.gameActive && currentLogsDir && currentLogsDir !== logsDir)
    await tailer?.stop()
    currentLogsDir = logsDir
    if (!keepParser) {
      parser = new BattlegroundsParser(settings.battleTag)
      match = parser.getMatch()
    }
    tailer = bindTailer()
    logCatchup = !keepParser
    try {
      if (keepParser) await tailer.startFromEnd(logsDir)
      else await tailer.start(logsDir)
      lastError = null
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    } finally {
      logCatchup = false
    }
    scheduleBroadcast()
    void pollPlayRating(true)
  }
  attachLogsChain = attachLogsChain.then(run, run)
  return attachLogsChain
}

function toSeenMinions(
  minions: {
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
    windfury?: boolean
    megaWindfury?: boolean
    stealth?: boolean
    deathrattle?: boolean
  }[]
): SeenMinion[] {
  return minions.map(seenFromCombat)
}

function currentFinalBoard(): SeenMinion[] {
  const frozen = lastFriendlyBoard.filter(isWarbandMinion).slice(0, 7)
  if (frozen.length) return frozen
  return parser.getFriendlyBoard().filter(isWarbandMinion).slice(0, 7)
}

function recordCompleted(result: MatchFinish): void {
  if (logCatchup || recordedThisMatch) return
  recordedThisMatch = true
  const heroName =
    match.heroName ||
    (match.heroCardId
      ? heroNames[match.heroCardId] ?? heroNames[baseCardId(match.heroCardId)] ?? null
      : null)
  session = recordFinish(session, {
    endedAt: new Date().toISOString(),
    placement: result.placement,
    turn: result.turn,
    matchKey: result.matchKey,
    heroName,
    heroCardId: match.heroCardId,
    mmrBefore: matchStartMmr ?? displayMmr(),
    mmrAfter: null,
    mmrDelta: null,
    mmrEstimated: false,
    board: currentFinalBoard()
  })
  const last = session.games[session.games.length - 1]
  if (session.startMmr == null && last?.mmrBefore != null) {
    session = { ...session, startMmr: last.mmrBefore }
  }
  void saveSession(userData(), session)
  beginPostGameMmr()
}

function applyLatestMmr(): void {
  const next = applyGameMmr(session, displayMmr())
  if (next === session) return
  session = next
  void saveSession(userData(), session)
}

function beginPostGameMmr(): void {
  if (logCatchup) return
  awaitingPostGameMmr = true
  ratingOcrFailed = false
  postGameAt = Date.now()
  scheduleMmrSettlement()
  void pollPlayRating(true)
}

function scheduleMmrSettlement(): void {
  if (mmrPollTimer) clearTimeout(mmrPollTimer)
  const elapsed = Date.now() - postGameAt
  const last = lastSessionGame()
  const settled = Boolean(last && gameMmrIsSettled(last))
  if (settled && elapsed > 12_000) {
    awaitingPostGameMmr = false
    ratingOcrFailed = false
    return
  }
  if (elapsed > SETTLEMENT_MAX_MS && !settled) {
    awaitingPostGameMmr = false
    ratingOcrFailed = true
    ratingOcr = { ...ratingOcr, failed: true, at: Date.now() }
    scheduleBroadcast()
    return
  }
  if (!awaitingPostGameMmr && settled) return
  void Promise.all([
    maybeRefreshLeaderboard(elapsed < 30_000),
    pollPlayRating(true)
  ]).then(() => {
    applyLatestMmr()
    scheduleBroadcast()
    const game = lastSessionGame()
    const done = Boolean(game && gameMmrIsSettled(game) && Date.now() - postGameAt > 12_000)
    if (done) {
      awaitingPostGameMmr = false
      ratingOcrFailed = false
      return
    }
    if (!awaitingPostGameMmr && (!game || gameMmrIsSettled(game))) return
    const mode = ratingPollMode({
      awaitingPostGameMmr,
      lastGameSettled: game ? gameMmrIsSettled(game) : true,
      hasLastGame: Boolean(game)
    })
    mmrPollTimer = setTimeout(() => scheduleMmrSettlement(), mode === 'postgame' ? 1500 : 8000)
  })
}

function leaveMatchToMenu(toHub: boolean): void {
  const wasActive = parser.getMatch().gameActive
  const wasSpectating = parser.getMatch().spectating
  const completed = parser.endLiveMatch()
  match = parser.getMatch()
  if (completed && !wasSpectating) recordCompleted(completed)
  else if (!logCatchup && !wasSpectating && wasActive && match.placement && match.placement > 0) {
    recordCompleted({ placement: match.placement, turn: match.turn, matchKey: null })
  }
  if (toHub) {
    parser.reset()
    match = { ...EMPTY_MATCH, lobby: [] }
  } else {
    parser.clearBetweenMatches()
    match = parser.getMatch()
  }
  combat = { ...EMPTY_COMBAT }
  lastCombatKey = ''
  lastBoards = []
  lastOpponentShot = null
  lastFriendlyBoard = []
  combatShotGen += 1
  if (combatShotTimer) {
    clearTimeout(combatShotTimer)
    combatShotTimer = null
  }
  if (wasActive) selectedTier = 0
  scheduleBroadcast()
}

function rememberBoard(side: CombatInput['opponent'], turn: number): void {
  const minions = side.minions.map(seenFromCombat).filter(isWarbandMinion).slice(0, 7)
  const hand = (side.hand ?? []).map(seenFromCombat).filter(isWarbandMinion).slice(0, 10)
  if (!minions.length && !hand.length) return
  const nameKey = normalizeName(side.name)
  lastBoards = [
    ...lastBoards.filter(
      (board) => board.playerId !== side.playerId && normalizeName(board.name) !== nameKey
    ),
    {
      playerId: side.playerId,
      name: side.name,
      turn,
      minions,
      hand
    }
  ]
}

function scheduleOpponentCombatShot(side: CombatInput['opponent'], turn: number): void {
  if (logCatchup) return
  lastOpponentShot = null
  const gen = ++combatShotGen
  if (combatShotTimer) clearTimeout(combatShotTimer)
  combatShotTimer = setTimeout(() => {
    combatShotTimer = null
    void grabOpponentCombatShot(gen, side, turn)
  }, 1000)
}

async function grabOpponentCombatShot(
  gen: number,
  side: CombatInput['opponent'],
  turn: number
): Promise<void> {
  if (gen !== combatShotGen || !match.inCombat) return
  const client = await host.getClientBounds()
  if (!client || gen !== combatShotGen || !match.inCombat) return
  const image = captureOpponentBoardDataUrl(opponentCombatCaptureRect(client))
  if (!image || gen !== combatShotGen) return
  lastOpponentShot = {
    playerId: side.playerId,
    name: side.name,
    turn,
    image
  }
  scheduleBroadcast()
}

function enqueueCombatSnapshot(finalSnapshot: boolean): void {
  combatSnapshotFlight = combatSnapshotFlight
    .then(() => handleCombatSnapshot(finalSnapshot))
    .catch((err) => {
      console.error('combat snapshot failed', err)
    })
}

async function handleCombatSnapshot(finalSnapshot: boolean): Promise<void> {
  let boards = parser.getCombat()
  if (!boards) return
  let ocrPartial = false
  if (finalSnapshot) {
    const probe = enrichCombatInput(boards, minions)
    const needs = combatInputNeedsHandOcr(probe, minions)
    if (needs.friendly || needs.opponent) {
      const client = await host.getClientBounds()
      if (!client) {
        ocrPartial = true
      } else if (!match.inCombat) {
        return
      } else {
        const hands = await readCombatHandsFromScreen(client, minions)
        if (!match.inCombat) return
        boards = parser.getCombat()
        if (!boards) return
        const statNeeds = combatInputNeedsHandStatOcr(probe, minions)
        if (needs.friendly) {
          if (hands.friendly.length) boards = mergeHandOcr(boards, { friendly: hands.friendly })
          else ocrPartial = true
          if (statNeeds.friendly && hands.statsUncertain.friendly) ocrPartial = true
        }
        if (needs.opponent) {
          if (hands.opponent.length) boards = mergeHandOcr(boards, { opponent: hands.opponent })
          else ocrPartial = true
          if (statNeeds.opponent && hands.statsUncertain.opponent) ocrPartial = true
        }
      }
    }
  }
  if (!match.inCombat || !boards) return
  rememberBoard(boards.opponent, match.turn)
  lastFriendlyBoard = toSeenMinions(boards.friendly.minions)
  runCombatSim(boards, ocrPartial)
  if (finalSnapshot) scheduleOpponentCombatShot(boards.opponent, match.turn)
}

function runCombatSim(input: CombatInput, ocrPartial = false): void {
  const enriched = enrichCombatInput(input, minions)
  const pools = buildSummonPools(minions, match.availableTribes)
  const partial = combatInputHasGaps(enriched, minions, pools) || ocrPartial
  const key = JSON.stringify({ board: enriched, partial, ocrPartial })
  if (key === lastCombatKey) return
  lastCombatKey = key
  const gen = ++simGen
  combat = {
    ...EMPTY_COMBAT,
    active: true,
    simulating: true,
    partial,
    opponentName: enriched.opponent.name,
    opponentPlayerId: enriched.opponent.playerId
  }
  scheduleBroadcast()
  const quick = simulateCombat(enriched, summons, COMBAT_QUICK_SAMPLES, undefined, pools)
  if (gen !== simGen) return
  combat = {
    ...EMPTY_COMBAT,
    ...quick,
    active: true,
    simulating: true,
    partial,
    opponentName: enriched.opponent.name,
    opponentPlayerId: enriched.opponent.playerId
  }
  scheduleBroadcast()
  setImmediate(() => {
    if (gen !== simGen || lastCombatKey !== key) return
    const full = simulateCombat(enriched, summons, COMBAT_FULL_SAMPLES, undefined, pools)
    combat = {
      ...EMPTY_COMBAT,
      ...full,
      active: true,
      simulating: false,
      partial,
      opponentName: enriched.opponent.name,
      opponentPlayerId: enriched.opponent.playerId
    }
    scheduleBroadcast()
  })
}

async function maybeRefreshLeaderboard(force: boolean): Promise<void> {
  if (leaderboardRefreshing) return
  const fetchedAt = await cacheTimestamp(userData())
  if (!force && boardRows.length && Date.now() - fetchedAt < 20 * 60 * 1000) return
  leaderboardRefreshing = true
  let lastProgressBroadcast = 0
  try {
    const rows = await refreshLeaderboard(userData(), settings.region, (partial) => {
      boardRows = partial
      applyLatestMmr()
      const now = Date.now()
      if (now - lastProgressBroadcast < 750) return
      lastProgressBroadcast = now
      scheduleBroadcast()
    })
    if (rows.length) boardRows = rows
    applyLatestMmr()
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  } finally {
    leaderboardRefreshing = false
    scheduleBroadcast()
  }
}

function dipBounds(
  win: BrowserWindow,
  bounds: { x: number; y: number; width: number; height: number }
) {
  if (process.platform !== 'win32') return bounds
  const dip = screen.screenToDipRect(win, {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  })
  return {
    x: Math.round(dip.x),
    y: Math.round(dip.y),
    width: Math.round(dip.width),
    height: Math.round(dip.height)
  }
}

async function tickOverlay(): Promise<void> {
  if (overlayTickBusy) return
  overlayTickBusy = true
  try {
    await tickOverlayBody()
  } finally {
    overlayTickBusy = false
  }
}

async function tickOverlayBody(): Promise<void> {
  if (bootstrap.phase !== 'ready') return
  const hwnd = await host.findHearthstone()
  const hsJustFound = hwnd != null && !hsFound
  hsFound = hwnd != null
  if (hsWasFound && !hsFound) void ensureWindowedOptions()
  hsWasFound = hsFound
  hsFocused = hsFound ? await host.isForeground() : false
  if (!hsFocused && overlayWindow && !overlayWindow.isDestroyed() && process.platform === 'win32') {
    hsFocused = isOverlayForeground(overlayWindow.getNativeWindowHandle())
  } else if (!hsFocused && overlayWindow && !overlayWindow.isDestroyed()) {
    hsFocused = overlayWindow.isFocused()
  }
  if (shouldPollRating(ratingPollContext())) void pollPlayRating(false)
  if (hsJustFound && shouldPollRating(ratingPollContext())) void pollPlayRating(true)

  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  const now = Date.now()
  if (now - lastDisplayCheck > 2000) {
    lastDisplayCheck = now
    displayMode = ensureGameOverlayFriendly(settings.overlayEnabled && settings.keepFullscreenOverlay)
    if (displayMode !== lastBroadcastMode) {
      lastBroadcastMode = displayMode
      scheduleBroadcast()
    }
  }

  const visible = settings.overlayEnabled && hsFound && (!settings.hideWhenUnfocused || hsFocused)
  if (!visible) {
    if (win.isVisible()) win.hide()
    lastBoundsKey = ''
    lastSizeKey = ''
    return
  }

  const raw = await host.getClientBounds()
  if (!raw) {
    if (win.isVisible()) win.hide()
    return
  }
  const bounds = dipBounds(win, raw)
  const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
  const sizeKey = `${bounds.width}x${bounds.height}`
  const moved = key !== lastBoundsKey || sizeKey !== lastSizeKey
  if (process.platform === 'win32') {
    if (moved) {
      followGameWindow(win.getNativeWindowHandle(), raw, clickThrough)
      lastBoundsKey = key
    }
    if (sizeKey !== lastSizeKey) {
      lastSizeKey = sizeKey
      win.setContentSize(bounds.width, bounds.height)
    }
  } else if (moved) {
    lastBoundsKey = key
    win.setBounds(bounds)
    syncClickThrough()
  }
  if (!win.isVisible()) win.showInactive()
  const nowPin = Date.now()
  if (moved || nowPin - lastPinAt > 2500) {
    lastPinAt = nowPin
    win.setAlwaysOnTop(true, 'screen-saver', 1)
    syncClickThrough()
  }
}

function syncClickThrough(passToGame = clickThrough): void {
  clickThrough = passToGame
  const win = overlayWindow
  if (!win || win.isDestroyed()) return
  if (process.platform === 'win32') {
    pinOverlayToGame(win.getNativeWindowHandle(), passToGame)
  }
  win.setIgnoreMouseEvents(passToGame, { forward: true })
}

function applyClickThrough(next: boolean): void {
  syncClickThrough(next)
}

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    resizable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    paintWhenInitiallyHidden: true,
    ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.webContents.setBackgroundThrottling(false)
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  if (process.platform === 'win32') {
    pinOverlayToGame(win.getNativeWindowHandle(), true)
  }
  win.setIgnoreMouseEvents(true, { forward: true })
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setWindowButtonVisibility(false)
  }
  loadWindow(win, 'overlay')
  return win
}

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 880,
    show: false,
    title: 'BattleBuddy',
    icon: appIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#0c1016',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.on('ready-to-show', () => {
    win.show()
    broadcast()
  })
  win.on('closed', () => {
    settingsWindow = null
    if (process.platform !== 'darwin') app.quit()
  })
  loadWindow(win, 'settings')
  return win
}

function createTray(): void {
  tray = new Tray(appIcon())
  tray.setToolTip('BattleBuddy')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open BattleBuddy', click: () => settingsWindow?.show() },
      {
        label: 'Toggle overlay',
        click: () => {
          settings = { ...settings, overlayEnabled: !settings.overlayEnabled }
          void saveSettings(userData(), settings)
          scheduleBroadcast()
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => settingsWindow?.show())
}

function registerShortcut(accelerator: string, fn: () => void): void {
  if (!globalShortcut.register(accelerator, fn)) {
    lastError = `Hotkey ${accelerator} is already in use.`
  }
}

function registerShortcuts(): void {
  registerShortcut('CommandOrControl+Shift+B', () => {
    settings = { ...settings, overlayEnabled: !settings.overlayEnabled }
    void saveSettings(userData(), settings)
    scheduleBroadcast()
  })
  for (let tier = 1; tier <= 7; tier++) {
    registerShortcut(`CommandOrControl+Shift+${tier}`, () => {
      selectedTier = tier
      scheduleBroadcast()
    })
  }
  registerShortcut('CommandOrControl+Shift+0', () => {
    selectedTier = 0
    scheduleBroadcast()
  })
  registerShortcut('CommandOrControl+Shift+C', () => {
    applyClickThrough(false)
    if (clickThroughTimer) clearTimeout(clickThroughTimer)
    clickThroughTimer = setTimeout(() => applyClickThrough(true), 5000)
  })
  registerShortcut('CommandOrControl+Shift+L', () => {
    settings = { ...settings, layoutUnlocked: !settings.layoutUnlocked }
    void saveSettings(userData(), settings)
    applyClickThrough(true)
    scheduleBroadcast()
  })
}

function fromAppWindow(sender: Electron.WebContents): boolean {
  return sender === overlayWindow?.webContents || sender === settingsWindow?.webContents
}

function registerIpc(): void {
  ipcMain.handle('get-state', () => snapshot())
  ipcMain.handle('set-settings', async (e, patch: Partial<AppSettings>) => {
    if (!fromAppWindow(e.sender)) return snapshot()
    const next = sanitizeSettings(settings, patch && typeof patch === 'object' ? patch : {})
    const regionChanged = next.region !== settings.region
    const layoutUnlocked = next.layoutUnlocked
    settings = next
    parser.setSelfBattleTag(settings.battleTag)
    if (patch?.currentMmr !== undefined) {
      session = bindCurrentMmr(session, settings.currentMmr)
      void saveSession(userData(), session)
    }
    await saveSettings(userData(), settings)
    if (patch?.layoutUnlocked != null) applyClickThrough(true)
    if (regionChanged) {
      boardRows = await loadLeaderboardCache(userData(), settings.region)
      void maybeRefreshLeaderboard(true)
    }
    scheduleBroadcast()
    return snapshot()
  })
  ipcMain.handle('pick-folder', async (e) => {
    if (!fromAppWindow(e.sender)) return null
    const result = await dialog.showOpenDialog({
      title: 'Select Hearthstone folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
  ipcMain.handle('refresh-leaderboard', async (e) => {
    if (!fromAppWindow(e.sender)) return snapshot()
    await maybeRefreshLeaderboard(true)
    return snapshot()
  })
  ipcMain.handle('open-logs', async (e) => {
    if (!fromAppWindow(e.sender)) return
    if (currentLogsDir) await shell.openPath(currentLogsDir)
  })
  ipcMain.handle('open-app-data', async (e) => {
    if (!fromAppWindow(e.sender)) return
    await shell.openPath(userData())
  })
  ipcMain.handle('open-rating-ocr-folder', async (e) => {
    if (!fromAppWindow(e.sender)) return
    const dir = join(userData(), 'rating-ocr')
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
  ipcMain.handle('refresh-rating', async (e) => {
    if (!fromAppWindow(e.sender)) return snapshot()
    lastPlayRatingAt = 0
    await pollPlayRating(true)
    return snapshot()
  })
  ipcMain.on('click-through', (e, enabled: boolean) => {
    if (e.sender !== overlayWindow?.webContents) return
    applyClickThrough(Boolean(enabled))
  })
  ipcMain.on('set-tier', (e, tier: number) => {
    if (e.sender !== overlayWindow?.webContents) return
    selectedTier = sanitizeTier(tier)
    scheduleBroadcast()
  })
  ipcMain.on('quit-app', (e) => {
    if (!fromAppWindow(e.sender)) return
    app.quit()
  })
  ipcMain.handle('update-check', async (e) => {
    if (!fromAppWindow(e.sender)) return snapshot()
    await updater.check()
    return snapshot()
  })
  ipcMain.handle('update-download', async (e) => {
    if (!fromAppWindow(e.sender)) return snapshot()
    await updater.download()
    return snapshot()
  })
  ipcMain.handle('update-install', (e) => {
    if (!fromAppWindow(e.sender)) return
    updater.install()
  })
  ipcMain.handle('update-dismiss', async (e) => {
    if (!fromAppWindow(e.sender)) return snapshot()
    updater.dismiss()
    scheduleBroadcast()
    return snapshot()
  })
  ipcMain.handle('open-release', async (e) => {
    if (!fromAppWindow(e.sender)) return
    await shell.openExternal(
      releasePageUrl(updater.state.currentVersion, updater.state.availableVersion)
    )
  })
}

app.commandLine.appendSwitch('enable-transparent-visuals')
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

app.whenReady().then(async () => {
  appStartedAt = Date.now()
  nativeTheme.themeSource = 'dark'
  app.setAppUserModelId('com.battlebuddy.app')
  updater = new AppUpdater(() => scheduleBroadcast())

  setBootstrap({ message: 'Loading settings…', progress: 12 })
  settings = await loadSettings(userData())
  session = bindCurrentMmr(await loadSession(userData()), settings.currentMmr)
  void saveSession(userData(), session)
  parser.setSelfBattleTag(settings.battleTag)

  registerIpc()
  createTray()
  settingsWindow = createSettingsWindow()
  registerShortcuts()

  setBootstrap({ message: 'Loading leaderboard…', progress: 38 })
  await new Promise<void>((resolve) => setImmediate(resolve))
  boardRows = await loadLeaderboardCache(userData(), settings.region)

  setBootstrap({ message: 'Loading card catalog…', progress: 62 })
  await new Promise<void>((resolve) => setImmediate(resolve))
  try {
    applyCardCatalog(await readCachedCardCatalog(userData()))
  } catch (err: unknown) {
    lastError = err instanceof Error ? err.message : String(err)
  }

  setBootstrap({ phase: 'ready', message: 'Ready', progress: 100 })
  scheduleBroadcast()

  setTimeout(() => ensureOverlayWindow(), 400)

  if (!settings.regionManual) {
    void detectBattleNetRegion().then((detected) => {
      if (detected && detected !== settings.region) {
        settings = { ...settings, region: detected }
        void saveSettings(userData(), settings)
        scheduleBroadcast()
      }
    })
  }
  void ensureLogConfig()
  void ensureWindowedOptions()
  scheduleLogAttach()

  void loadCardCatalog(userData(), applyCardCatalog).catch((err: unknown) => {
    if (!minions.length) lastError = err instanceof Error ? err.message : String(err)
    scheduleBroadcast()
  })

  const selfTag = normalizeName(leaderboardAccountId(settings.battleTag))
  const haveSelf = selfTag ? indexLeaderboard(boardRows).has(selfTag) : boardRows.length > 0
  const needLeaderboard = boardRows.length === 0 || !haveSelf
  setTimeout(() => void maybeRefreshLeaderboard(needLeaderboard), STARTUP_GRACE_MS)
  setTimeout(() => void updater.check(), STARTUP_GRACE_MS)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (overlayTickTimer) clearInterval(overlayTickTimer)
  if (logsAttachTimer) clearInterval(logsAttachTimer)
  void tailer?.stop()
  void cleanupOcrTemps()
})

app.on('activate', () => {
  if (!settingsWindow) settingsWindow = createSettingsWindow()
  else settingsWindow.show()
})

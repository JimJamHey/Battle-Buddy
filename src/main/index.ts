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
  isEndGameDisconnect,
  simulateCombat,
  enrichCombatInput,
  combatInputHasGaps,
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
  type SessionState,
  type TrackerStatus,
  EMPTY_COMBAT,
  EMPTY_MATCH,
  baseCardId,
  isWarbandMinion,
  seenFromCombat
} from '../core/index'
import { createGameHost, pinOverlayToGame, followGameWindow, isOverlayForeground, ensureGameOverlayFriendly } from '../platform/index'
import { detectBattleNetRegion } from '../platform/battleNet'
import { loadCardCatalog } from './cards'
import { appIcon } from './icon'
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
let lastBoards: SeenBoard[] = []
let lastFriendlyBoard: SeenMinion[] = []
let matchStartMmr: number | null = null
let recordedThisMatch = false
let playedAsSelf = false
let logCatchup = false
let playRatingBusy = false
let lastPlayRatingAt = 0
let mmrPollTimer: NodeJS.Timeout | null = null
let awaitingPostGameMmr = false
let postGameAt = 0
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
let hsWasFound = false
let displayMode: OverlayDisplayMode = 'unknown'
let lastBroadcastMode: OverlayDisplayMode = 'unknown'
let leaderboardRefreshing = false
let lastInstallCheck = 0
let lastLogAttach = 0
let cachedInstallPath: string | null = null
let updater: AppUpdater

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
    displayMode
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
  if (
    rating != null &&
    !acceptObservedRating(rating, {
      previous: settings.currentMmr ?? session.games.at(-1)?.mmrAfter ?? null,
      battleTag: settings.battleTag,
      resync: !match.gameActive || awaitingPostGameMmr
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

async function pollPlayRating(force = false): Promise<void> {
  if ((process.platform !== 'win32' && process.platform !== 'darwin') || playRatingBusy || !hsFound) return
  const wantResults =
    awaitingPostGameMmr || Boolean(playedAsSelf && match.placement && match.placement > 0)
  if (match.gameActive && !wantResults) return
  const now = Date.now()
  const minGap = wantResults ? 900 : 2500
  if (!force && now - lastPlayRatingAt < minGap) return
  lastPlayRatingAt = now
  const bounds = await host.getClientBounds()
  if (!bounds) return
  playRatingBusy = true
  try {
    const observed = await readRatingObservation(bounds, { includeResults: wantResults })
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
    const settled = awaitingPostGameMmr && now - postGameAt > 12_000
    if (observed.rating != null || observed.delta != null) noteObservedRating(observed, { settled })
  } catch {
    /* Play-screen OCR is best-effort */
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
    strategies: strategyCatalog(
      minions,
      match.gameActive ? match.availableTribes : [],
      curatedStrategies
    ).map((row) => ({
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
        lastFriendlyBoard = []
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
      if (result.combatEvent === 'start' && match.inCombat) {
        const boards = parser.getCombat()
        if (boards) {
          rememberBoard(boards.opponent, match.turn)
          lastFriendlyBoard = toSeenMinions(boards.friendly.minions)
          runCombatSim(boards)
        }
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
      scheduleBroadcast()
    },
    (line) => {
      if (logCatchup) return
      const mode = parseLoadingScreenScene(line)
      if (!mode) return
      const scene = sceneFromMode(mode)
      if (scene === 'gameplay') return
      if (scene === 'bacon' || scene === 'hub') {
        leaveMatchToMenu(scene === 'hub')
        if (scene === 'bacon' && awaitingPostGameMmr) void pollPlayRating(true)
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
  postGameAt = Date.now()
  pollMmrAfterGame(40)
  void pollPlayRating(true)
}

function pollMmrAfterGame(attempts: number): void {
  if (mmrPollTimer) clearTimeout(mmrPollTimer)
  void Promise.all([maybeRefreshLeaderboard(true), pollPlayRating(true)]).then(() => {
    applyLatestMmr()
    scheduleBroadcast()
    if (attempts <= 1 || !awaitingPostGameMmr) {
      if (attempts <= 1) awaitingPostGameMmr = false
      return
    }
    const last = session.games[session.games.length - 1]
    if (last && gameMmrIsSettled(last) && Date.now() - postGameAt > 12_000) {
      awaitingPostGameMmr = false
      return
    }
    mmrPollTimer = setTimeout(() => pollMmrAfterGame(attempts - 1), 1_500)
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
  lastFriendlyBoard = []
  if (wasActive) selectedTier = 0
  scheduleBroadcast()
}

function rememberBoard(side: CombatInput['opponent'], turn: number): void {
  const minions = side.minions.map(seenFromCombat).filter(isWarbandMinion).slice(0, 7)
  if (!minions.length) return
  const nameKey = normalizeName(side.name)
  lastBoards = [
    ...lastBoards.filter(
      (board) => board.playerId !== side.playerId && normalizeName(board.name) !== nameKey
    ),
    {
      playerId: side.playerId,
      name: side.name,
      turn,
      minions
    }
  ]
}

function runCombatSim(input: CombatInput): void {
  const enriched = enrichCombatInput(input, minions)
  const partial = combatInputHasGaps(enriched, minions)
  const key = JSON.stringify(enriched)
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
  const quick = simulateCombat(enriched, summons, 48)
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
    const full = simulateCombat(enriched, summons, 180)
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
  try {
    const rows = await refreshLeaderboard(userData(), settings.region, (partial) => {
      boardRows = partial
      applyLatestMmr()
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
  const hwnd = await host.findHearthstone()
  hsFound = hwnd != null
  if (hsWasFound && !hsFound) void ensureWindowedOptions()
  hsWasFound = hsFound
  hsFocused = hsFound ? await host.isForeground() : false
  if (!hsFocused && overlayWindow && !overlayWindow.isDestroyed() && process.platform === 'win32') {
    hsFocused = isOverlayForeground(overlayWindow.getNativeWindowHandle())
  } else if (!hsFocused && overlayWindow && !overlayWindow.isDestroyed()) {
    hsFocused = overlayWindow.isFocused()
  }
  void pollPlayRating(false)
  const now = Date.now()
  if (now - lastLogAttach > 800) {
    lastLogAttach = now
    void (async () => {
      const install = await resolveInstall()
      if (install && install !== settings.hearthstonePath && existsSync(install)) {
        settings = { ...settings, hearthstonePath: install }
        void saveSettings(userData(), settings)
      }
      if (install) await attachLogs(install)
    })()
  }

  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  displayMode = ensureGameOverlayFriendly(settings.overlayEnabled && settings.keepFullscreenOverlay)
  if (displayMode !== lastBroadcastMode) {
    lastBroadcastMode = displayMode
    scheduleBroadcast()
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
  if (process.platform === 'win32') {
    followGameWindow(win.getNativeWindowHandle(), raw, clickThrough)
    if (sizeKey !== lastSizeKey) {
      lastSizeKey = sizeKey
      win.setContentSize(bounds.width, bounds.height)
    }
    lastBoundsKey = key
  } else if (key !== lastBoundsKey) {
    lastBoundsKey = key
    win.setBounds(bounds)
    syncClickThrough()
  }
  if (!win.isVisible()) win.showInactive()
  const nowPin = Date.now()
  if (nowPin - lastPinAt > 200) {
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
  nativeTheme.themeSource = 'dark'
  app.setAppUserModelId('com.battlebuddy.app')
  updater = new AppUpdater(() => scheduleBroadcast())
  settings = await loadSettings(userData())
  if (!settings.regionManual) {
    const detected = await detectBattleNetRegion()
    if (detected && detected !== settings.region) {
      settings = { ...settings, region: detected }
      await saveSettings(userData(), settings)
    }
  }
  session = bindCurrentMmr(await loadSession(userData()), settings.currentMmr)
  void saveSession(userData(), session)
  parser.setSelfBattleTag(settings.battleTag)
  boardRows = await loadLeaderboardCache(userData(), settings.region)
  const selfTag = normalizeName(leaderboardAccountId(settings.battleTag))
  const haveSelf = selfTag ? indexLeaderboard(boardRows).has(selfTag) : boardRows.length > 0

  registerIpc()
  await ensureLogConfig()
  await ensureWindowedOptions()
  createTray()
  settingsWindow = createSettingsWindow()
  overlayWindow = createOverlayWindow()
  applyClickThrough(true)
  registerShortcuts()
  void loadCardCatalog(userData())
    .then((catalog) => {
      minions = catalog.minions
      heroNames = catalog.heroes
      summons = catalog.summons
      scheduleBroadcast()
    })
    .catch((err: unknown) => {
      lastError = err instanceof Error ? err.message : String(err)
      scheduleBroadcast()
    })
  void maybeRefreshLeaderboard(boardRows.length === 0 || !haveSelf)
  void updater.check()

  const interval = process.platform === 'darwin' ? 250 : 100
  setInterval(() => {
    void tickOverlay()
  }, interval)
  void tickOverlay()
  void pollPlayRating(true)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  void tailer?.stop()
  void cleanupOcrTemps()
})

app.on('activate', () => {
  if (!settingsWindow) settingsWindow = createSettingsWindow()
  else settingsWindow.show()
})

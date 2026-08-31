import { todayKey, isWarbandMinion } from './parser'
import type { SessionGame, SessionState } from './types'

export const MAX_RECENT_GAMES = 10
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000

export function emptySession(now = new Date()): SessionState {
  return { date: todayKey(now), games: [], startMmr: null }
}

export function ensureToday(session: SessionState, now = new Date()): SessionState {
  const date = todayKey(now)
  if (session.date !== date) {
    return { date, games: [], startMmr: null }
  }
  const raw = Array.isArray(session.games) ? session.games : []
  const kept = raw.filter((game) => (game.endedAt || '').startsWith(date))
  if (kept.length === raw.length && kept.length <= MAX_RECENT_GAMES) return session
  return {
    ...session,
    date,
    games: dedupeGames(kept).slice(-MAX_RECENT_GAMES),
    startMmr: session.startMmr ?? null
  }
}

export function hydrateGameMmr(session: SessionState): SessionState {
  return {
    ...session,
    games: dedupeGames(session.games).map((game) => ({
      ...stripGuessedMmr(game),
      board: (game.board ?? []).filter(isWarbandMinion).slice(0, 7)
    }))
  }
}

export function bindCurrentMmr(session: SessionState, current: number | null, now = new Date()): SessionState {
  let next = hydrateGameMmr(ensureToday(session, now))
  if (current != null) next = applyGameMmr(next, current)
  const today = gamesToday(next, now)
  const firstBefore = today[0]?.mmrBefore ?? null
  if (today.length === 0 && current != null) {
    next = { ...next, startMmr: current }
  } else if (firstBefore != null && next.startMmr != null && Math.abs(next.startMmr - firstBefore) > 400) {
    next = { ...next, startMmr: firstBefore }
  }
  if (next.startMmr != null) return next
  if (firstBefore != null) return { ...next, startMmr: firstBefore }
  if (current != null) return { ...next, startMmr: current }
  return next
}

export function recordFinish(session: SessionState, game: SessionGame, now = new Date()): SessionState {
  const current = ensureToday(session, now)
  const filled = stripGuessedMmr(game)
  const idx = current.games.findIndex((existing) => isSameMatch(existing, filled))
  if (idx >= 0) {
    const games = [...current.games]
    games[idx] = mergeGames(games[idx], filled)
    return { ...current, games }
  }
  return { ...current, games: [...current.games, filled].slice(-MAX_RECENT_GAMES) }
}

export function gamesToday(session: SessionState, now = new Date()): SessionGame[] {
  const date = todayKey(now)
  return session.games.filter((game) => (game.endedAt || '').startsWith(date))
}

export function averageFinish(session: SessionState, now = new Date()): number | null {
  const games = gamesToday(session, now)
  if (!games.length) return null
  const sum = games.reduce((acc, g) => acc + g.placement, 0)
  return Math.round((sum / games.length) * 10) / 10
}

export function applyGameMmr(
  session: SessionState,
  rating: number | null,
  opts?: { allowUnchanged?: boolean }
): SessionState {
  return applyRatingObservation(session, { rating, delta: null }, { settled: opts?.allowUnchanged })
}

export function applyRatingObservation(
  session: SessionState,
  observation: { rating: number | null; delta: number | null },
  opts?: { settled?: boolean }
): SessionState {
  if (!session.games.length) return session
  let rating = observation.rating
  let delta = observation.delta
  if (rating == null && delta == null) return session
  let idx = -1
  for (let i = session.games.length - 1; i >= 0; i--) {
    const game = session.games[i]
    if (game.mmrAfter == null || game.mmrDelta == null || copiedSessionTotalDelta(session, game)) {
      idx = i
      break
    }
  }
  if (idx < 0) {
    const last = session.games.length - 1
    if (observationCorrectsGame(session.games[last], { rating, delta })) idx = last
    else return session
  }
  const game = session.games[idx]
  if (delta != null && copiedSessionTotalDelta(session, { ...game, mmrDelta: delta })) {
    delta = null
  }
  if (delta != null && !deltaFitsPlacement(game.placement, delta)) delta = null
  const before = game.mmrBefore ?? null
  if (rating != null && before != null && !ratingFitsPlacement(game.placement, before, rating)) {
    rating = null
  }
  if (rating == null && delta == null) return session
  if (rating != null && delta != null && before != null && rating !== before + delta) {
    delta = null
  }
  let nextBefore = before
  let after = game.mmrAfter ?? null
  if (delta != null) {
    if (nextBefore != null) after = nextBefore + delta
    else if (rating != null) {
      after = rating
      nextBefore = rating - delta
    } else {
      return session
    }
  }
  if (rating != null) {
    if (nextBefore != null && rating === nextBefore && delta == null && !opts?.settled) return session
    after = rating
    if (nextBefore == null && delta != null) nextBefore = rating - delta
  }
  if (after == null) return session
  const nextDelta = nextBefore != null ? after - nextBefore : delta
  if (
    after === game.mmrAfter &&
    nextBefore === (game.mmrBefore ?? null) &&
    nextDelta === (game.mmrDelta ?? null)
  ) {
    return session
  }
  const next = [...session.games]
  next[idx] = {
    ...game,
    mmrBefore: nextBefore,
    mmrAfter: after,
    mmrDelta: nextDelta ?? null,
    mmrEstimated: false
  }
  return { ...session, games: next }
}

/** True once the last game's MMR matches the Play/results screen and the placement. */
export function gameMmrIsSettled(game: SessionGame): boolean {
  if (game.mmrBefore == null || game.mmrAfter == null || game.mmrDelta == null) return false
  if (game.mmrAfter !== game.mmrBefore + game.mmrDelta) return false
  return deltaFitsPlacement(game.placement, game.mmrDelta)
}

export function isSameMatch(a: SessionGame, b: SessionGame): boolean {
  if (a.matchKey && b.matchKey) return a.matchKey === b.matchKey
  if (a.placement !== b.placement || a.turn !== b.turn) return false
  const heroA = (a.heroName || '').trim()
  const heroB = (b.heroName || '').trim()
  if (a.matchKey || b.matchKey) {
    if (heroA && heroB && heroA !== heroB) return false
  } else if (!heroA || !heroB || heroA !== heroB) {
    return false
  }
  const ta = Date.parse(a.endedAt)
  const tb = Date.parse(b.endedAt)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  return Math.abs(ta - tb) < DUPLICATE_WINDOW_MS
}

export function dedupeGames(games: SessionGame[]): SessionGame[] {
  const out: SessionGame[] = []
  for (const game of games) {
    const idx = out.findIndex((existing) => isSameMatch(existing, game))
    if (idx >= 0) out[idx] = mergeGames(out[idx], game)
    else out.push(game)
  }
  return out.slice(-MAX_RECENT_GAMES)
}

function mergeGames(a: SessionGame, b: SessionGame): SessionGame {
  const aTime = Date.parse(a.endedAt)
  const bTime = Date.parse(b.endedAt)
  const later = aTime >= bTime ? a : b
  const earlier = later === a ? b : a
  const before = a.mmrBefore ?? b.mmrBefore ?? null
  const after = a.mmrAfter ?? b.mmrAfter ?? null
  return {
    ...later,
    matchKey: a.matchKey || b.matchKey,
    heroName: later.heroName || earlier.heroName,
    heroCardId: later.heroCardId || earlier.heroCardId,
    board: (a.board?.length ?? 0) >= (b.board?.length ?? 0) ? a.board : b.board,
    mmrBefore: before,
    mmrAfter: after,
    mmrDelta: before != null && after != null ? after - before : null,
    mmrEstimated: false
  }
}

function copiedSessionTotalDelta(
  session: SessionState,
  game: Pick<SessionGame, 'mmrBefore' | 'mmrDelta'>
): boolean {
  if (session.startMmr == null || game.mmrBefore == null || game.mmrDelta == null) return false
  return game.mmrDelta === game.mmrBefore - session.startMmr
}

function deltaFitsPlacement(placement: number | undefined, delta: number): boolean {
  if (placement == null) return true
  if (placement <= 2 && delta < 0) return false
  if (placement >= 7 && delta > 0) return false
  return true
}

function ratingFitsPlacement(placement: number | undefined, before: number, after: number): boolean {
  return deltaFitsPlacement(placement, after - before)
}

function observationCorrectsGame(
  game: SessionGame,
  observation: { rating: number | null; delta: number | null }
): boolean {
  const before = game.mmrBefore
  if (before == null) return false
  const { rating, delta } = observation
  if (rating != null && delta != null && rating === before + delta) {
    if (!ratingFitsPlacement(game.placement, before, rating)) return false
    return game.mmrAfter !== rating || game.mmrDelta !== delta
  }
  if (rating != null && game.mmrAfter != null && rating !== game.mmrAfter) {
    const implied = rating - before
    if (Math.abs(implied) <= 300 && ratingFitsPlacement(game.placement, before, rating)) return true
  }
  return false
}

function stripGuessedMmr(game: SessionGame): SessionGame {
  if (!game.mmrEstimated) {
    const before = game.mmrBefore ?? null
    const after = game.mmrAfter ?? null
    return {
      ...game,
      mmrBefore: before,
      mmrAfter: after,
      mmrDelta: before != null && after != null ? after - before : null,
      mmrEstimated: false
    }
  }
  return {
    ...game,
    mmrBefore: null,
    mmrAfter: null,
    mmrDelta: null,
    mmrEstimated: false
  }
}

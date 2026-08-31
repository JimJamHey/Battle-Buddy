import { looksLikeHeroName } from '../core/heroes'
import { isPlaceholderName } from '../core/parser'
import type { CombatOdds, LobbyMmrRow, OverlaySnapshot, UpdateState } from '../core/types'

export function formatMmr(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('en-US')
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatDamageRange(min: number, max: number): string {
  const lo = Math.max(0, Math.round(min))
  const hi = Math.max(lo, Math.round(max))
  return lo === hi ? String(lo) : `${lo}–${hi}`
}

export function formatDelta(value: number | null | undefined, estimated = false): string {
  if (value == null) return '—'
  const text = value > 0 ? `+${value.toLocaleString('en-US')}` : value.toLocaleString('en-US')
  return estimated ? `~${text}` : text
}

export function ordinal(place: number): string {
  const v = place % 100
  const suffix = ['th', 'st', 'nd', 'rd']
  return `${place}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`
}

export function placeClass(place: number): string {
  if (place === 1) return 'place-1'
  if (place <= 4) return 'place-good'
  return 'place-bad'
}

export function selfRating(
  state: Pick<OverlaySnapshot, 'lobbyMmr' | 'session' | 'selfPublicMmr' | 'settings'>
): number | null {
  const last = state.session.games[state.session.games.length - 1]
  const live = state.settings?.currentMmr ?? null
  if (
    last?.mmrAfter != null &&
    last.mmrBefore != null &&
    live != null &&
    live === last.mmrBefore &&
    last.mmrAfter !== live
  ) {
    return last.mmrAfter
  }
  if (live != null) return live
  if (last?.mmrAfter != null) return last.mmrAfter
  if (state.selfPublicMmr != null) return state.selfPublicMmr
  const self = state.lobbyMmr.find((row) => row.isSelf)
  if (self?.rating != null) return self.rating
  return state.session.startMmr
}

export function ratingLabel(
  state: Pick<OverlaySnapshot, 'lobbyMmr' | 'session' | 'selfPublicMmr' | 'settings'>
): string {
  return formatMmr(selfRating(state))
}

export function lobbyRatingLabel(row: LobbyMmrRow): string {
  if (row.unknownName) return 'Unknown'
  if (row.rating != null) return formatMmr(row.rating)
  return 'Unlisted'
}

export function combatOpponentLabel(
  combat: Pick<CombatOdds, 'opponentName' | 'opponentPlayerId'>,
  lobby: LobbyMmrRow[]
): string | null {
  const battleTag = (name: string | null | undefined): string | null => {
    if (!name) return null
    const stripped = name.replace(/#\d+$/, '').trim()
    if (!stripped || isPlaceholderName(stripped) || looksLikeHeroName(stripped)) return null
    return stripped
  }
  if (combat.opponentPlayerId != null && combat.opponentPlayerId > 0) {
    const row = lobby.find((entry) => entry.playerId === combat.opponentPlayerId)
    const fromRow = row && !row.unknownName ? battleTag(row.name) : null
    if (fromRow) return fromRow
  }
  const fromCombat = battleTag(combat.opponentName)
  if (fromCombat) return fromCombat
  const raw = combat.opponentName
  if (!raw) return null
  const key = raw.replace(/#\d+$/, '').trim().toLowerCase()
  const byHero = lobby.find((entry) => entry.heroName && entry.heroName.trim().toLowerCase() === key)
  if (byHero && !byHero.unknownName) return battleTag(byHero.name)
  return null
}

export function shouldShowUpdate(update: UpdateState): boolean {
  if (update.dismissed && update.phase !== 'ready' && update.phase !== 'downloading') return false
  return (
    update.phase === 'available' ||
    update.phase === 'downloading' ||
    update.phase === 'ready' ||
    update.phase === 'error'
  )
}

export type RatingPollMode = 'idle' | 'postgame'

export type Scene = 'unknown' | 'hub' | 'bacon' | 'gameplay' | 'other'

export function shouldPollRating(input: {
  hsFound: boolean
  logCatchup: boolean
  gameActive: boolean
  scene: Scene
  awaitingPostGameMmr: boolean
  placement: number | null
  playedAsSelf: boolean
  lastGameSettled: boolean
  hasLastGame: boolean
}): boolean {
  if (!input.hsFound || input.logCatchup) return false
  const wantResults =
    input.awaitingPostGameMmr || Boolean(input.playedAsSelf && input.placement && input.placement > 0)
  if (input.gameActive && !wantResults) return false
  if (input.awaitingPostGameMmr || (input.hasLastGame && !input.lastGameSettled)) return true
  if (!input.gameActive && (input.scene === 'bacon' || input.scene === 'unknown')) return true
  return false
}

export function ratingPollMode(input: {
  awaitingPostGameMmr: boolean
  lastGameSettled: boolean
  hasLastGame: boolean
}): RatingPollMode {
  if (input.awaitingPostGameMmr || (input.hasLastGame && !input.lastGameSettled)) return 'postgame'
  return 'idle'
}

export function ratingPollIntervalMs(mode: RatingPollMode): number {
  return mode === 'postgame' ? 900 : 8000
}

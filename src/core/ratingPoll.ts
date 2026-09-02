export type RatingPollMode = 'idle' | 'postgame'

export type Scene = 'unknown' | 'hub' | 'bacon' | 'gameplay' | 'other'

const MENU_SCENES = new Set<Scene>(['bacon', 'hub', 'unknown'])

export function isMenuScene(scene: Scene): boolean {
  return MENU_SCENES.has(scene)
}

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
  /** Menu rating already read and matches settings — skip idle menu polling. */
  menuRatingSynced?: boolean
}): boolean {
  if (!input.hsFound || input.logCatchup) return false
  const wantResults =
    input.awaitingPostGameMmr || Boolean(input.playedAsSelf && input.placement && input.placement > 0)
  if (input.gameActive && !wantResults) return false
  if (input.awaitingPostGameMmr || (input.hasLastGame && !input.lastGameSettled)) return true
  if (!input.gameActive && isMenuScene(input.scene)) return !input.menuRatingSynced
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

/** Menu polling stops only after a recent OCR read matches settings. */
export function ratingMenuSynced(
  currentMmr: number | null,
  ocrRating: number | null,
  ocrAt: number | null = null
): boolean {
  if (currentMmr == null || ocrRating == null || ocrAt == null) return false
  if (currentMmr !== ocrRating) return false
  return Date.now() - ocrAt < 10 * 60 * 1000
}

export function ratingPollIntervalMs(mode: RatingPollMode): number {
  if (mode === 'postgame') return 900
  return 8000
}

/** Hide the overlay during capture only when panels could cover the results plaque. */
export function shouldHideOverlayForRating(mode: RatingPollMode): boolean {
  return mode === 'postgame'
}

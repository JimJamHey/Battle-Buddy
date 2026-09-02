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
}): boolean {
  if (!input.hsFound || input.logCatchup) return false
  const wantResults =
    input.awaitingPostGameMmr || Boolean(input.playedAsSelf && input.placement && input.placement > 0)
  if (input.gameActive && !wantResults) return false
  if (input.awaitingPostGameMmr || (input.hasLastGame && !input.lastGameSettled)) return true
  // Battlegrounds lobby / Play screen — rating is visible before clicking Play.
  if (!input.gameActive && isMenuScene(input.scene)) return true
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

export function ratingPollIntervalMs(mode: RatingPollMode, menuIdle = false): number {
  if (mode === 'postgame') return 900
  return menuIdle ? 2500 : 6000
}

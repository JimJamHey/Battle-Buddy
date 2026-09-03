import {
  clampLeftDockedPanel,
  clampOverlayPos,
  clampRightDockedPanel,
  mergeOverlayLayout,
  migrateOverlayLayout
} from './layout'
import { sanitizeRatingCapture } from './playRating'
import { resolveTheme } from './theme'
import { DEFAULT_RATING_CAPTURE, DEFAULT_SETTINGS, type AppSettings, type OverlayLayout, type Region } from './types'

const REGIONS = new Set<Region>(['US', 'EU', 'AP'])

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function clampLayout(layout: OverlayLayout): OverlayLayout {
  return {
    rail: clampLeftDockedPanel(layout.rail),
    combat: clampOverlayPos(layout.combat),
    pool: clampRightDockedPanel(layout.pool)
  }
}

/** Runtime-validate renderer patches so IPC cannot persist junk. */
export function sanitizeSettings(base: AppSettings, patch: Partial<AppSettings> = {}): AppSettings {
  const next: AppSettings = { ...DEFAULT_SETTINGS, ...base }
  if (typeof patch.battleTag === 'string') next.battleTag = patch.battleTag.replace(/\s+/g, ' ').trim().slice(0, 64)
  if (patch.region && REGIONS.has(patch.region)) next.region = patch.region
  if (typeof patch.regionManual === 'boolean') next.regionManual = patch.regionManual
  if (typeof patch.hearthstonePath === 'string') next.hearthstonePath = patch.hearthstonePath.slice(0, 512)
  if (typeof patch.hideWhenUnfocused === 'boolean') next.hideWhenUnfocused = patch.hideWhenUnfocused
  if (typeof patch.overlayEnabled === 'boolean') next.overlayEnabled = patch.overlayEnabled
  if (patch.overlayOpacity != null) next.overlayOpacity = clamp(Number(patch.overlayOpacity), 40, 100)
  if (typeof patch.layoutUnlocked === 'boolean') next.layoutUnlocked = patch.layoutUnlocked
  if (typeof patch.keepFullscreenOverlay === 'boolean') next.keepFullscreenOverlay = patch.keepFullscreenOverlay
  if (typeof patch.showSessionOnOverlay === 'boolean') next.showSessionOnOverlay = patch.showSessionOnOverlay
  next.showLobbyOnOverlay = false
  if (typeof patch.showRatingCaptureRegions === 'boolean') {
    next.showRatingCaptureRegions = patch.showRatingCaptureRegions
  }
  next.ratingCapture = sanitizeRatingCapture(patch.ratingCapture ?? next.ratingCapture ?? DEFAULT_RATING_CAPTURE)
  if (patch.overlayLayout) {
    next.overlayLayout = clampLayout(
      migrateOverlayLayout(mergeOverlayLayout(next.overlayLayout, patch.overlayLayout))
    )
  } else {
    next.overlayLayout = clampLayout(migrateOverlayLayout(next.overlayLayout))
  }
  if (patch.currentMmr === null) next.currentMmr = null
  else if (typeof patch.currentMmr === 'number' && Number.isFinite(patch.currentMmr)) {
    next.currentMmr = clamp(Math.round(patch.currentMmr), 0, 30000)
  }
  next.theme = resolveTheme(patch.theme ?? next.theme)
  return next
}

export function sanitizeTier(tier: unknown): number {
  const n = Number(tier)
  if (!Number.isFinite(n)) return 0
  return Math.min(7, Math.max(0, Math.round(n)))
}

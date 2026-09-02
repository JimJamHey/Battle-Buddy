import {
  DEFAULT_OVERLAY_LAYOUT,
  DEFAULT_PANEL_WIDTH,
  type OverlayLayout,
  type OverlayPoolLayout,
  type OverlayPos
} from './types'

const MIN_PANEL_WIDTH = 14
const MAX_PANEL_WIDTH = 28

export function clampPoolWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width * 10) / 10))
}

/**
 * Side panels scale with viewport via clamp(); user preference is the vw middle term.
 * Bounds live in CSS (--overlay-panel-min/max) so every resolution gets fluid sizing.
 */
export function panelWidthStyle(widthPct: number): string {
  const vw = clampPoolWidth(widthPct)
  return `clamp(var(--overlay-panel-min), ${vw}vw, var(--overlay-panel-max))`
}

export function poolWidthStyle(widthPct: number): string {
  return panelWidthStyle(widthPct)
}

export function mergeOverlayLayout(
  base: OverlayLayout = DEFAULT_OVERLAY_LAYOUT,
  patch?: Partial<OverlayLayout> | null
): OverlayLayout {
  return {
    rail: { ...DEFAULT_OVERLAY_LAYOUT.rail, ...base.rail, ...patch?.rail },
    combat: { ...DEFAULT_OVERLAY_LAYOUT.combat, ...base.combat, ...patch?.combat },
    pool: {
      ...DEFAULT_OVERLAY_LAYOUT.pool,
      ...base.pool,
      ...patch?.pool,
      w: clampPoolWidth(patch?.pool?.w ?? base.pool?.w ?? DEFAULT_OVERLAY_LAYOUT.pool.w)
    }
  }
}

/** Clamp panel origin; pass measured width % when available (see DraggablePanel). */
export function clampOverlayPos(pos: OverlayPos, panelWidthPct = 0): OverlayPos {
  const maxX = Math.max(0, 100 - Math.max(0, panelWidthPct))
  return {
    x: Math.min(maxX, Math.max(0, pos.x)),
    y: Math.min(88, Math.max(0, pos.y))
  }
}

export function clampPoolLayout(pool: OverlayPoolLayout): OverlayPoolLayout {
  const w = clampPoolWidth(pool.w)
  return { ...clampOverlayPos(pool, w), w }
}

/** Older builds parked the pool along the bottom; move those to the HDT right-hand list. */
export function migrateOverlayLayout(layout: OverlayLayout): OverlayLayout {
  let merged = mergeOverlayLayout(DEFAULT_OVERLAY_LAYOUT, layout)
  if (merged.pool.x < 55 && merged.pool.y > 35) {
    merged = { ...merged, pool: { ...DEFAULT_OVERLAY_LAYOUT.pool, w: merged.pool.w } }
  }
  if (merged.pool.w >= 24) {
    merged = { ...merged, pool: { ...merged.pool, w: DEFAULT_PANEL_WIDTH } }
  }
  if (merged.pool.x > 78) {
    merged = { ...merged, pool: { ...merged.pool, x: DEFAULT_OVERLAY_LAYOUT.pool.x } }
  }
  return merged
}

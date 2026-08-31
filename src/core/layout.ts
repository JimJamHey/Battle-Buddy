import { DEFAULT_OVERLAY_LAYOUT, type OverlayLayout, type OverlayPos } from './types'

export function mergeOverlayLayout(
  base: OverlayLayout = DEFAULT_OVERLAY_LAYOUT,
  patch?: Partial<OverlayLayout> | null
): OverlayLayout {
  return {
    rail: { ...DEFAULT_OVERLAY_LAYOUT.rail, ...base.rail, ...patch?.rail },
    combat: { ...DEFAULT_OVERLAY_LAYOUT.combat, ...base.combat, ...patch?.combat },
    pool: { ...DEFAULT_OVERLAY_LAYOUT.pool, ...base.pool, ...patch?.pool }
  }
}

export function clampOverlayPos(pos: OverlayPos): OverlayPos {
  return {
    x: Math.min(88, Math.max(0, pos.x)),
    y: Math.min(88, Math.max(0, pos.y))
  }
}

/** Older builds parked the pool along the bottom; move those to the HDT right-hand list. */
export function migrateOverlayLayout(layout: OverlayLayout): OverlayLayout {
  const merged = mergeOverlayLayout(DEFAULT_OVERLAY_LAYOUT, layout)
  if (merged.pool.x < 55 && merged.pool.y > 35) {
    return { ...merged, pool: { ...DEFAULT_OVERLAY_LAYOUT.pool } }
  }
  // Wider side panels need a bit more room on the right edge.
  if (merged.pool.x > 73) {
    return { ...merged, pool: { ...merged.pool, x: DEFAULT_OVERLAY_LAYOUT.pool.x } }
  }
  return merged
}

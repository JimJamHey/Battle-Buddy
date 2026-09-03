import {
  DEFAULT_OVERLAY_LAYOUT,
  DEFAULT_PANEL_WIDTH,
  type OverlayLayout,
  type OverlaySizedPanel,
  type OverlayPos
} from './types'

export { DEFAULT_PANEL_WIDTH }

const MIN_PANEL_WIDTH = 10
const MAX_PANEL_WIDTH = 30
/** One-time shrink for saves from the old oversized default range. */
const LEGACY_WIDE_WIDTH = 18

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width * 10) / 10))
}

/** @deprecated use clampPanelWidth */
export const clampPoolWidth = clampPanelWidth

/** vw preference for sized panels; rendered width follows this value. */
export function panelWidthStyle(widthPct: number): string {
  return `${clampPanelWidth(widthPct)}vw`
}

export function poolWidthStyle(widthPct: number): string {
  return panelWidthStyle(widthPct)
}

export function dockRightX(widthPct: number): number {
  return Math.max(0, 100 - clampPanelWidth(widthPct))
}

function clampDockedY(y: number): number {
  return Math.min(88, Math.max(0, y))
}

/** Session rail — pinned to the left edge; only width and vertical offset are stored. */
export function clampLeftDockedPanel(panel: OverlaySizedPanel): OverlaySizedPanel {
  const w = clampPanelWidth(panel.w)
  return { x: 0, y: clampDockedY(panel.y), w }
}

/** Minion pool — pinned to the right edge; only width and vertical offset are stored. */
export function clampRightDockedPanel(panel: OverlaySizedPanel): OverlaySizedPanel {
  const w = clampPanelWidth(panel.w)
  return { x: dockRightX(w), y: clampDockedY(panel.y), w }
}

export function mergeOverlayLayout(
  base: OverlayLayout = DEFAULT_OVERLAY_LAYOUT,
  patch?: Partial<OverlayLayout> | null
): OverlayLayout {
  const railW = patch?.rail?.w ?? base.rail?.w ?? DEFAULT_OVERLAY_LAYOUT.rail.w
  const poolW = patch?.pool?.w ?? base.pool?.w ?? DEFAULT_OVERLAY_LAYOUT.pool.w
  return {
    rail: {
      ...DEFAULT_OVERLAY_LAYOUT.rail,
      ...base.rail,
      ...patch?.rail,
      w: clampPanelWidth(railW)
    },
    combat: { ...DEFAULT_OVERLAY_LAYOUT.combat, ...base.combat, ...patch?.combat },
    pool: {
      ...DEFAULT_OVERLAY_LAYOUT.pool,
      ...base.pool,
      ...patch?.pool,
      w: clampPanelWidth(poolW)
    }
  }
}

/** Clamp free-floating panel origin; pass measured width % when available (see DraggablePanel). */
export function clampOverlayPos(pos: OverlayPos, panelWidthPct = 0): OverlayPos {
  const maxX = Math.max(0, 100 - Math.max(0, panelWidthPct))
  return {
    x: Math.min(maxX, Math.max(0, pos.x)),
    y: clampDockedY(pos.y)
  }
}

/** @deprecated use clampLeftDockedPanel or clampRightDockedPanel */
export function clampSizedPanel(panel: OverlaySizedPanel): OverlaySizedPanel {
  const w = clampPanelWidth(panel.w)
  return { ...clampOverlayPos(panel, w), w }
}

/** @deprecated use clampLeftDockedPanel or clampRightDockedPanel */
export const clampPoolLayout = clampRightDockedPanel

function shrinkLegacyWidePanel(panel: OverlaySizedPanel): OverlaySizedPanel {
  if (panel.w > LEGACY_WIDE_WIDTH) return { ...panel, w: DEFAULT_PANEL_WIDTH }
  return panel
}

/** Snap side panels to screen edges and preserve user widths. */
export function migrateOverlayLayout(layout: OverlayLayout): OverlayLayout {
  let merged = mergeOverlayLayout(DEFAULT_OVERLAY_LAYOUT, layout)
  if (merged.pool.x < 55 && merged.pool.y > 35) {
    merged = {
      ...merged,
      pool: { ...DEFAULT_OVERLAY_LAYOUT.pool, y: merged.pool.y, w: merged.pool.w }
    }
  }
  if (merged.pool.w === 26) {
    merged = { ...merged, pool: { ...merged.pool, w: DEFAULT_PANEL_WIDTH } }
  }
  if (merged.rail.w === 26) {
    merged = { ...merged, rail: { ...merged.rail, w: DEFAULT_PANEL_WIDTH } }
  }
  // Old combat x was the left edge (~27). Centered combat uses x as the midpoint.
  if (merged.combat.x > 20 && merged.combat.x < 35 && merged.combat.y < 5) {
    merged = { ...merged, combat: { ...merged.combat, x: 50 } }
  }
  merged = {
    ...merged,
    rail: shrinkLegacyWidePanel(merged.rail),
    pool: shrinkLegacyWidePanel(merged.pool)
  }
  return {
    ...merged,
    rail: clampLeftDockedPanel(merged.rail),
    pool: clampRightDockedPanel(merged.pool)
  }
}

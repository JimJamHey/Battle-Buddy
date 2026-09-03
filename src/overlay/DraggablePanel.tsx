import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { clampOverlayPos } from '../core/layout'
import type { OverlayPos } from '../core/types'

export type PanelAnchor = 'free' | 'left' | 'right'

function measuredPanelWidthPct(panel: HTMLElement | null, root: Element | null, fallbackVw: number): number {
  if (!panel || !root) return fallbackVw
  const rootRect = root.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  if (rootRect.width <= 0) return fallbackVw
  return (panelRect.width / rootRect.width) * 100
}

export function DraggablePanel({
  pos,
  unlocked,
  className,
  dockClassName,
  width,
  panelWidthPct = 0,
  anchor = 'free',
  centerX = false,
  draggable = true,
  resizable = false,
  resizeWhenLocked = false,
  resizeEdge = 'corner',
  onMove,
  onMoveEnd,
  onResize,
  onResizeEnd,
  onInteract,
  children
}: {
  pos: OverlayPos
  unlocked: boolean
  className?: string
  dockClassName?: string
  width?: string
  panelWidthPct?: number
  anchor?: PanelAnchor
  /** Position using pos.x as the horizontal center (translateX -50%). */
  centerX?: boolean
  draggable?: boolean
  resizable?: boolean
  resizeWhenLocked?: boolean
  resizeEdge?: 'corner' | 'inner'
  onMove?: (pos: OverlayPos) => void
  onMoveEnd?: (pos: OverlayPos) => void
  onResize?: (widthPct: number) => void
  onResizeEnd?: (widthPct: number) => void
  onInteract: (inside: boolean) => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)
  const resize = useRef<{ ox: number; ow: number } | null>(null)
  const posRef = useRef(pos)
  const widthRef = useRef(panelWidthPct)
  const anchorRef = useRef(anchor)
  const centerXRef = useRef(centerX)
  const onMoveRef = useRef(onMove)
  const onMoveEndRef = useRef(onMoveEnd)
  const onResizeRef = useRef(onResize)
  const onResizeEndRef = useRef(onResizeEnd)
  const onInteractRef = useRef(onInteract)
  posRef.current = pos
  widthRef.current = panelWidthPct
  anchorRef.current = anchor
  centerXRef.current = centerX
  onMoveRef.current = onMove
  onMoveEndRef.current = onMoveEnd
  onResizeRef.current = onResize
  onResizeEndRef.current = onResizeEnd
  onInteractRef.current = onInteract

  const canResize = resizable && (unlocked || resizeWhenLocked)
  const canDrag = draggable && unlocked
  const docked = anchor === 'left' || anchor === 'right'

  useEffect(() => {
    const clampForPanel = (next: OverlayPos): OverlayPos => {
      const root = panelRef.current?.closest('.overlay-root')
      const sized = dockRef.current ?? panelRef.current
      const widthPct = measuredPanelWidthPct(sized, root ?? null, widthRef.current)
      if (centerXRef.current) {
        const half = Math.max(0, widthPct / 2)
        return {
          x: Math.min(100 - half, Math.max(half, next.x)),
          y: Math.min(88, Math.max(0, next.y))
        }
      }
      return clampOverlayPos(next, widthPct)
    }

    const resizeDelta = (event: PointerEvent, startOx: number, startOw: number, rect: DOMRect): number => {
      const raw = ((event.clientX - startOx) / rect.width) * 100
      return anchorRef.current === 'right' ? startOw - raw : startOw + raw
    }

    const move = (event: PointerEvent) => {
      const root = panelRef.current?.closest('.overlay-root')
      if (!root) return
      const rect = root.getBoundingClientRect()
      if (resize.current) {
        onResizeRef.current?.(resizeDelta(event, resize.current.ox, resize.current.ow, rect))
        return
      }
      if (!drag.current) return
      onMoveRef.current?.(
        clampForPanel({
          x: drag.current.px + ((event.clientX - drag.current.ox) / rect.width) * 100,
          y: drag.current.py + ((event.clientY - drag.current.oy) / rect.height) * 100
        })
      )
    }
    const up = (event: PointerEvent) => {
      const root = panelRef.current?.closest('.overlay-root')
      if (resize.current) {
        const start = resize.current
        resize.current = null
        if (root) {
          const rect = root.getBoundingClientRect()
          onResizeEndRef.current?.(resizeDelta(event, start.ox, start.ow, rect))
        }
        onInteractRef.current(false)
        return
      }
      if (!drag.current) return
      const start = drag.current
      drag.current = null
      if (!root) {
        onInteractRef.current(false)
        return
      }
      const rect = root.getBoundingClientRect()
      const next = clampForPanel({
        x: start.px + ((event.clientX - start.ox) / rect.width) * 100,
        y: start.py + ((event.clientY - start.oy) / rect.height) * 100
      })
      onMoveRef.current?.(next)
      onMoveEndRef.current?.(next)
      onInteractRef.current(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canDrag) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, .no-drag, .resize-grip, .resize-edge')) return
    const fromHandle = Boolean(target.closest('.drag-grip, [data-drag-handle]'))
    if (!unlocked && !fromHandle) return
    onInteract(true)
    drag.current = {
      ox: event.clientX,
      oy: event.clientY,
      px: posRef.current.x,
      py: posRef.current.y
    }
    event.preventDefault()
  }

  const startResize = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canResize) return
    onInteract(true)
    resize.current = { ox: event.clientX, ow: widthRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  const widthVars =
    panelWidthPct > 0 ? ({ ['--panel-width-vw' as string]: `${panelWidthPct}vw` } as CSSProperties) : { width }

  const panelStyle: CSSProperties =
    anchor === 'right'
      ? { right: '0', left: 'auto', ...(docked ? {} : { top: `${pos.y}%` }), ...widthVars }
      : anchor === 'left'
        ? { left: '0', ...(docked ? {} : { top: `${pos.y}%` }), ...widthVars }
        : centerX
          ? { left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translateX(-50%)', width }
          : { left: `${pos.x}%`, top: `${pos.y}%`, width }

  const innerResize =
    canResize &&
    resizeEdge === 'inner' &&
    docked && (
      <div
        className={`resize-edge resize-edge-outside interactive capture-mouse no-drag ${anchor === 'right' ? 'resize-edge-left' : 'resize-edge-right'}`}
        role="separator"
        aria-label="Drag to resize panel width"
        title="Drag inner edge to resize width"
        onPointerDown={startResize}
        onPointerEnter={() => onInteract(true)}
        onPointerLeave={() => {
          if (!resize.current) onInteract(false)
        }}
      />
    )

  const cornerResize =
    canResize &&
    resizeEdge !== 'inner' && (
      <div
        className={`resize-grip interactive capture-mouse no-drag ${resizeWhenLocked ? 'resize-grip-persistent' : ''} ${anchor === 'right' ? 'resize-grip-left' : ''}`}
        role="button"
        aria-label="Resize panel"
        onPointerDown={startResize}
      />
    )

  const panel = (
    <div
      ref={panelRef}
      className={`float-panel ${canDrag || canResize ? 'interactive capture-mouse' : ''} ${canDrag ? 'unlocked' : ''} ${docked ? `anchor-${anchor} docked` : ''} ${className ?? ''}`}
      onPointerDown={startDrag}
    >
      {canDrag ? (
        <div
          className="drag-grip interactive capture-mouse"
          data-drag-handle
          role="button"
          aria-label="Move panel"
          aria-grabbed={false}
          tabIndex={0}
        >
          Move
        </div>
      ) : null}
      {children}
      {cornerResize || null}
    </div>
  )

  if (!docked) {
    return (
      <div className="panel-dock panel-dock-free" style={panelStyle}>
        {panel}
      </div>
    )
  }

  return (
    <div
      ref={dockRef}
      className={`panel-dock anchor-${anchor} docked ${dockClassName ?? ''} ${canResize && resizeEdge === 'inner' ? 'has-resize-edge' : ''}`}
      style={panelStyle}
    >
      {innerResize || null}
      {panel}
    </div>
  )
}

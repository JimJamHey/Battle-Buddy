import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { clampOverlayPos } from '../core/layout'
import type { OverlayPos } from '../core/types'

export function DraggablePanel({
  pos,
  unlocked,
  className,
  width,
  onMove,
  onMoveEnd,
  onInteract,
  children
}: {
  pos: OverlayPos
  unlocked: boolean
  className?: string
  width?: string
  onMove: (pos: OverlayPos) => void
  onMoveEnd?: (pos: OverlayPos) => void
  onInteract: (inside: boolean) => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)
  const posRef = useRef(pos)
  const onMoveRef = useRef(onMove)
  const onMoveEndRef = useRef(onMoveEnd)
  const onInteractRef = useRef(onInteract)
  posRef.current = pos
  onMoveRef.current = onMove
  onMoveEndRef.current = onMoveEnd
  onInteractRef.current = onInteract

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return
      const root = panelRef.current?.closest('.overlay-root')
      if (!root) return
      const rect = root.getBoundingClientRect()
      onMoveRef.current(
        clampOverlayPos({
          x: drag.current.px + ((event.clientX - drag.current.ox) / rect.width) * 100,
          y: drag.current.py + ((event.clientY - drag.current.oy) / rect.height) * 100
        })
      )
    }
    const up = (event: PointerEvent) => {
      if (!drag.current) return
      const root = panelRef.current?.closest('.overlay-root')
      const start = drag.current
      drag.current = null
      if (!root) {
        onInteractRef.current(false)
        return
      }
      const rect = root.getBoundingClientRect()
      const next = clampOverlayPos({
        x: start.px + ((event.clientX - start.ox) / rect.width) * 100,
        y: start.py + ((event.clientY - start.oy) / rect.height) * 100
      })
      onMoveRef.current(next)
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
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, .no-drag')) return
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

  return (
    <div
      ref={panelRef}
      className={`float-panel ${unlocked ? 'interactive unlocked capture-mouse' : ''} ${className ?? ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width }}
      onPointerDown={startDrag}
    >
      {unlocked ? (
        <div
          className="drag-grip interactive capture-mouse"
          data-drag-handle
          onMouseEnter={() => onInteract(true)}
          onMouseLeave={() => {
            if (!drag.current) onInteract(false)
          }}
        >
          Move
        </div>
      ) : null}
      {children}
    </div>
  )
}

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { clampPctRect } from '../core/playRating'
import { ratingOcrLabel } from '../ui/format'
import { DEFAULT_RATING_CAPTURE, type PctRect, type RatingCaptureSettings, type RatingOcrStatus } from '../core/types'

function roundRegion(region: PctRect): PctRect {
  return {
    x: Math.round(region.x * 10) / 10,
    y: Math.round(region.y * 10) / 10,
    w: Math.round(region.w * 10) / 10,
    h: Math.round(region.h * 10) / 10
  }
}

function CaptureBox({
  label,
  tone,
  region,
  fallback,
  hint,
  onChange,
  onChangeEnd,
  onInteract
}: {
  label: string
  tone: 'play' | 'results' | 'lobby'
  region: PctRect
  fallback: PctRect
  hint?: string
  onChange: (region: PctRect) => void
  onChangeEnd: (region: PctRect) => void
  onInteract: (inside: boolean) => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)
  const resize = useRef<{ ox: number; oy: number; ow: number; oh: number } | null>(null)
  const regionRef = useRef(region)
  const onChangeRef = useRef(onChange)
  const onChangeEndRef = useRef(onChangeEnd)
  const onInteractRef = useRef(onInteract)
  regionRef.current = region
  onChangeRef.current = onChange
  onChangeEndRef.current = onChangeEnd
  onInteractRef.current = onInteract

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const root = boxRef.current?.closest('.overlay-root')
      if (!root) return
      const rect = root.getBoundingClientRect()
      if (resize.current) {
        const next = clampPctRect(
          {
            ...regionRef.current,
            w: resize.current.ow + ((event.clientX - resize.current.ox) / rect.width) * 100,
            h: resize.current.oh + ((event.clientY - resize.current.oy) / rect.height) * 100
          },
          fallback
        )
        onChangeRef.current(next)
        return
      }
      if (!drag.current) return
      onChangeRef.current(
        clampPctRect(
          {
            ...regionRef.current,
            x: drag.current.px + ((event.clientX - drag.current.ox) / rect.width) * 100,
            y: drag.current.py + ((event.clientY - drag.current.oy) / rect.height) * 100
          },
          fallback
        )
      )
    }
    const up = (event: PointerEvent) => {
      const root = boxRef.current?.closest('.overlay-root')
      if (resize.current) {
        const start = resize.current
        resize.current = null
        if (root) {
          const rect = root.getBoundingClientRect()
          onChangeEndRef.current(
            clampPctRect(
              {
                ...regionRef.current,
                w: start.ow + ((event.clientX - start.ox) / rect.width) * 100,
                h: start.oh + ((event.clientY - start.oy) / rect.height) * 100
              },
              fallback
            )
          )
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
      onChangeEndRef.current(
        clampPctRect(
          {
            ...regionRef.current,
            x: start.px + ((event.clientX - start.ox) / rect.width) * 100,
            y: start.py + ((event.clientY - start.oy) / rect.height) * 100
          },
          fallback
        )
      )
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
  }, [fallback])

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.resize-grip, button')) return
    onInteract(true)
    drag.current = {
      ox: event.clientX,
      oy: event.clientY,
      px: regionRef.current.x,
      py: regionRef.current.y
    }
    event.preventDefault()
  }

  const startResize = (event: ReactPointerEvent<HTMLElement>) => {
    onInteract(true)
    resize.current = {
      ox: event.clientX,
      oy: event.clientY,
      ow: regionRef.current.w,
      oh: regionRef.current.h
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const shown = roundRegion(region)
  return (
    <div
      ref={boxRef}
      className={`rating-capture-box ${tone} interactive capture-mouse`}
      style={{
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.w}%`,
        height: `${region.h}%`
      }}
      onPointerDown={startDrag}
    >
      <div className="rating-capture-label">
        <strong>{label}</strong>
        <span>
          {shown.x.toFixed(1)}%, {shown.y.toFixed(1)}% · {shown.w.toFixed(1)}×{shown.h.toFixed(1)}
        </span>
        {hint ? <em>{hint}</em> : null}
      </div>
      <div className="resize-grip interactive capture-mouse no-drag" role="presentation" onPointerDown={startResize} />
    </div>
  )
}

export function RatingCaptureGuide({
  capture,
  ocr,
  onChange,
  onChangeEnd,
  onInteract,
  onScan
}: {
  capture: RatingCaptureSettings
  ocr: RatingOcrStatus | null | undefined
  onChange: (next: RatingCaptureSettings) => void
  onChangeEnd: (next: RatingCaptureSettings) => void
  onInteract: (inside: boolean) => void
  onScan: () => void | Promise<void>
}) {
  const parsed = ratingOcrLabel(ocr)

  return (
    <>
      <div className="rating-capture-hint interactive capture-mouse" role="status">
        <span>{parsed}</span>
        <button type="button" className="rating-capture-scan" onClick={() => void onScan()}>
          Scan now
        </button>
      </div>
      <CaptureBox
        label="Play rating"
        tone="play"
        region={capture.play}
        fallback={DEFAULT_RATING_CAPTURE.play}
        hint={parsed}
        onChange={(play) => onChange({ ...capture, play })}
        onChangeEnd={(play) => onChangeEnd({ ...capture, play })}
        onInteract={onInteract}
      />
      <CaptureBox
        label="Results plaque"
        tone="results"
        region={capture.results}
        fallback={DEFAULT_RATING_CAPTURE.results}
        hint="Shown after a game ends"
        onChange={(results) => onChange({ ...capture, results })}
        onChangeEnd={(results) => onChangeEnd({ ...capture, results })}
        onInteract={onInteract}
      />
      <CaptureBox
        label="BG Lobby MMR"
        tone="lobby"
        region={capture.lobby}
        fallback={DEFAULT_RATING_CAPTURE.lobby}
        hint="Shown when you first open Battlegrounds"
        onChange={(lobby) => onChange({ ...capture, lobby })}
        onChangeEnd={(lobby) => onChangeEnd({ ...capture, lobby })}
        onInteract={onInteract}
      />
    </>
  )
}

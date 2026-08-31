import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { boardCardUrls, goldenCardId, cardTavernRenderUrls } from '../core/cards'
import { firstAvailable, warmUrls } from './imageCache'
import { CardArt } from './CardArt'

export type HoverCard = {
  id: string
  name: string
  dbfId?: number
  goldenId?: string | null
  kind?: string
}

type Hover = {
  card: HoverCard
  left: number
  top: number
  placeRight: boolean
}

function hasGoldenPreview(card: HoverCard): boolean {
  return card.kind !== 'spell'
}

export function warmHoverCard(card: HoverCard): void {
  warmUrls(boardCardUrls(card.id, card.name, card.dbfId, false))
  warmUrls(cardTavernRenderUrls(card.name, card.dbfId, false))
  if (!hasGoldenPreview(card)) return
  const goldenId = goldenCardId(card.id, card.goldenId)
  warmUrls(boardCardUrls(goldenId, card.name, card.dbfId, true))
  warmUrls(cardTavernRenderUrls(card.name, card.dbfId, true))
}

export function CardHoverPreview({ hover }: { hover: Hover | null }) {
  const [shown, setShown] = useState<Hover | null>(null)
  const [phase, setPhase] = useState<'in' | 'out'>('out')
  const shownId = useRef<string | null>(null)
  const pendingId = useRef<string | null>(null)
  const hoverRef = useRef(hover)
  const seq = useRef(0)
  hoverRef.current = hover

  useEffect(() => {
    if (!hover) {
      seq.current += 1
      pendingId.current = null
      setPhase('out')
      const hide = window.setTimeout(() => {
        shownId.current = null
        setShown(null)
      }, 260)
      return () => window.clearTimeout(hide)
    }

    if (shownId.current === hover.card.id) {
      setShown(hover)
      setPhase('in')
      return
    }

    if (pendingId.current === hover.card.id) return

    const token = ++seq.current
    const card = hover.card
    pendingId.current = card.id
    const normalUrls = boardCardUrls(card.id, card.name, card.dbfId, false)
    const goldenUrls = hasGoldenPreview(card)
      ? boardCardUrls(goldenCardId(card.id, card.goldenId), card.name, card.dbfId, true)
      : []
    warmUrls(goldenUrls)
    void firstAvailable(normalUrls).then(() => {
      if (seq.current !== token) return
      const latest = hoverRef.current
      if (!latest || latest.card.id !== card.id) return
      pendingId.current = null
      shownId.current = card.id
      setShown(latest)
      setPhase('in')
    })
  }, [hover])

  if (!shown) return null
  const card = shown.card
  const showGolden = hasGoldenPreview(card)
  const goldenId = showGolden ? goldenCardId(card.id, card.goldenId) : null
  return createPortal(
    <div
      className={`card-preview ${showGolden ? 'dual' : 'single'} ${shown.placeRight ? 'right' : 'left'} is-${phase}`}
      style={{ left: shown.left, top: shown.top }}
    >
      {goldenId ? (
        <div className="card-preview-slot golden" key={`g-${card.id}`}>
          <CardArt
            className="card-preview-art"
            cardId={goldenId}
            name={card.name}
            dbfId={card.dbfId}
            variant="golden"
            hideIfMissing
          />
        </div>
      ) : null}
      <div className="card-preview-slot normal" key={`n-${card.id}`}>
        <CardArt
          className="card-preview-art"
          cardId={card.id}
          name={card.name}
          dbfId={card.dbfId}
          variant="render"
          hideIfMissing
        />
      </div>
    </div>,
    document.body
  )
}

function hoverPosition(row: HTMLElement): Pick<Hover, 'left' | 'top' | 'placeRight'> {
  const rect = row.getBoundingClientRect()
  const previewH = Math.min(window.innerHeight * 0.82, 560)
  const previewW = Math.min(560, window.innerWidth * 0.5)
  const placeRight = rect.left < previewW + 20
  const left = placeRight ? rect.right : rect.left
  const top = Math.min(
    window.innerHeight - previewH / 2 - 8,
    Math.max(previewH / 2 + 8, rect.top + rect.height / 2)
  )
  return { left, top, placeRight }
}

export function useCardHover(
  rootRef: RefObject<HTMLElement | null>,
  cardById: Map<string, HoverCard>,
  rowSelector = '.pool-row'
): Hover | null {
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onMove = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const row =
        hit instanceof Element
          ? (hit.closest(rowSelector) as HTMLElement | null)
          : null
      if (!row || !root.contains(row)) {
        setHover((prev) => (prev ? null : prev))
        return
      }
      const cardId = row.dataset.cardId ?? ''
      const card = cardById.get(cardId)
      if (!card) {
        setHover((prev) => (prev ? null : prev))
        return
      }
      warmHoverCard(card)
      const pos = hoverPosition(row)
      setHover((prev) => {
        if (
          prev &&
          prev.card.id === card.id &&
          Math.abs(prev.left - pos.left) < 2 &&
          Math.abs(prev.top - pos.top) < 2 &&
          prev.placeRight === pos.placeRight
        ) {
          return prev
        }
        return { card, ...pos }
      })
    }
    const onLeave = () => setHover(null)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    return () => {
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
    }
  }, [cardById, rootRef, rowSelector])

  return hover
}

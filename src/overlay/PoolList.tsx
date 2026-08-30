import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BgMinion } from '../core/types'
import { boardCardUrls, goldenCardId, cardTavernRenderUrls } from '../core/cards'
import { groupLabel, isTierGroupTitle } from '../core/pool'
import { tribeSlug } from '../core/heroes'
import { firstAvailable, warmUrls } from './imageCache'
import { CardArt } from './CardArt'

type Hover = {
  card: BgMinion
  left: number
  top: number
  placeRight: boolean
}

function hasGoldenPreview(card: BgMinion): boolean {
  return card.kind !== 'spell'
}

function warmHover(card: BgMinion): void {
  warmUrls(boardCardUrls(card.id, card.name, card.dbfId, false))
  warmUrls(cardTavernRenderUrls(card.name, card.dbfId, false))
  if (!hasGoldenPreview(card)) return
  const goldenId = goldenCardId(card.id, card.goldenId)
  warmUrls(boardCardUrls(goldenId, card.name, card.dbfId, true))
}

function PoolCardPreview({ hover }: { hover: Hover | null }) {
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
    void firstAvailable(boardCardUrls(card.id, card.name, card.dbfId, false)).then(() => {
      if (seq.current !== token) return
      const latest = hoverRef.current
      if (!latest || latest.card.id !== card.id) return
      pendingId.current = null
      shownId.current = card.id
      setShown(latest)
      setPhase('in')
    })
    if (hasGoldenPreview(card)) {
      void firstAvailable(boardCardUrls(goldenCardId(card.id, card.goldenId), card.name, card.dbfId, true))
    }
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

function LazyTile({ cardId, name }: { cardId: string; name: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShow(true)
          io.disconnect()
        }
      },
      { rootMargin: '160px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <span className="pool-slice" ref={ref}>
      {show ? <CardArt className="pool-tile" cardId={cardId} name={name} variant="tile" /> : null}
    </span>
  )
}

export function PoolList({
  groups,
  cardUnavailable,
  showTierBubble = true
}: {
  groups: { title: string; cards: BgMinion[] }[]
  cardUnavailable?: (card: BgMinion) => boolean
  showTierBubble?: boolean
}) {
  const [hover, setHover] = useState<Hover | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => {
    const map = new Map<string, BgMinion>()
    for (const group of groups) {
      for (const card of group.cards) map.set(card.id, card)
    }
    return map
  }, [groups])
  const ordered = useMemo(() => groups.flatMap((group) => group.cards), [groups])

  useEffect(() => {
    const cards = ordered.slice(0, 12)
    const idle = window.setTimeout(() => {
      for (const card of cards) warmHover(card)
    }, 80)
    return () => window.clearTimeout(idle)
  }, [ordered])

  useEffect(() => {
    const root = listRef.current
    if (!root) return
    const onMove = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const row = hit instanceof Element ? hit.closest('.pool-row') : null
      if (!(row instanceof HTMLElement) || !root.contains(row)) {
        setHover((prev) => (prev ? null : prev))
        return
      }
      const card = byId.get(row.dataset.cardId ?? '')
      if (!card) {
        setHover((prev) => (prev ? null : prev))
        return
      }
      warmHover(card)
      const rect = row.getBoundingClientRect()
      const previewH = Math.min(window.innerHeight * 0.82, 560)
      const previewW = Math.min(560, window.innerWidth * 0.5)
      const placeRight = rect.left < previewW + 20
      const left = placeRight ? rect.right : rect.left
      const top = Math.min(
        window.innerHeight - previewH / 2 - 8,
        Math.max(previewH / 2 + 8, rect.top + rect.height / 2)
      )
      setHover((prev) => {
        if (
          prev &&
          prev.card.id === card.id &&
          Math.abs(prev.left - left) < 2 &&
          Math.abs(prev.top - top) < 2 &&
          prev.placeRight === placeRight
        ) {
          return prev
        }
        return { card, left, top, placeRight }
      })
    }
    const onLeave = () => setHover(null)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    return () => {
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
    }
  }, [byId])

  const preview = <PoolCardPreview hover={hover} />

  if (!groups.length) {
    return (
      <>
        <p className="hint pool-empty">No minions for this filter.</p>
        {preview}
      </>
    )
  }

  return (
    <>
      <div ref={listRef} className={`pool-list no-drag ${showTierBubble ? 'with-tier-bubbles' : 'by-tier'}`}>
        {groups.map((group) => (
          <section className="pool-group" key={group.title}>
            <header
              className={`pool-group-head ${
                isTierGroupTitle(group.title) ? 'tier-head' : `tribe-${tribeSlug(group.title)}`
              }`}
            >
              <span>{groupLabel(group.title)}</span>
            </header>
            {group.cards.map((card) => {
              return (
                <div
                  className={`pool-row ${cardUnavailable?.(card) ? 'unavailable' : ''}`}
                  data-card-id={card.id}
                  key={card.id}
                  onPointerEnter={() => warmHover(card)}
                >
                  {showTierBubble ? <span className="pool-tier">{card.techLevel}</span> : null}
                  <span className="pool-name">{card.name}</span>
                  {card.kind === 'spell' ? <span className="pool-cost">{card.cost}</span> : null}
                  <LazyTile cardId={card.id} name={card.name} />
                </div>
              )
            })}
          </section>
        ))}
      </div>
      {preview}
    </>
  )
}

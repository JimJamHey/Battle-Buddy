import { useEffect, useMemo, useRef, useState } from 'react'
import type { BgMinion, StrategyCompView } from '../core/types'
import { CardArt } from './CardArt'
import { CardHoverPreview, type HoverCard, warmHoverCard, useCardHover } from './CardHoverPreview'

function neededCards(comp: StrategyCompView) {
  const seen = new Set<string>()
  const rows: Array<{ id: string; name: string; techLevel: number; role?: string }> = []
  for (const card of [...comp.core, ...comp.essential]) {
    if (seen.has(card.id)) continue
    seen.add(card.id)
    rows.push(card)
  }
  return rows
}

function blurb(comp: StrategyCompView) {
  const text = (comp.why || comp.notes || '').trim()
  if (text) return text
  const bits = [...comp.tribes, comp.mechanic].filter(Boolean)
  return bits.length ? bits.join(' · ') : 'Core minions for this direction.'
}

export function CompsPanel({
  comps,
  live,
  waitingForTribes,
  minions
}: {
  comps: StrategyCompView[]
  live: boolean
  waitingForTribes?: boolean
  minions: BgMinion[]
}) {
  const rootRef = useRef<HTMLElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const catalog = useMemo(() => new Map(minions.map((card) => [card.id, card])), [minions])
  const open = comps.find((row) => row.id === openId) ?? null

  useEffect(() => {
    if (openId && !comps.some((row) => row.id === openId)) setOpenId(null)
  }, [comps, openId])

  const cardById = useMemo(() => {
    const map = new Map<string, HoverCard>()
    for (const comp of comps) {
      for (const card of neededCards(comp)) {
        const full = catalog.get(card.id)
        map.set(card.id, full ?? { id: card.id, name: card.name, dbfId: 0 })
      }
    }
    return map
  }, [comps, catalog])
  const hover = useCardHover(rootRef, cardById, '.comp-need .pool-row')

  const curated = comps.some((row) => row.status === 'curated')
  const inLobbyCount = comps.filter((row) => row.inLobby !== false).length
  const chip = waitingForTribes
    ? 'Waiting'
    : live
      ? `${inLobbyCount}/${comps.length} lobby`
      : curated
        ? 'Curated'
        : 'Catalog'
  const empty = comps.length
    ? null
    : waitingForTribes
      ? 'Lobby types still resolving…'
      : 'No strategies in the catalog yet.'

  return (
    <section
      ref={rootRef}
      className="comps-panel comps-filled capture-mouse"
    >
      {open ? (
        <div className="comp-detail">
          <header className="comp-detail-head">
            <button type="button" className="comp-back" onClick={() => setOpenId(null)}>
              Back
            </button>
            <h2>{open.name}</h2>
          </header>
          <p className="comp-blurb">{blurb(open)}</p>
          <ul className="comp-need">
            {neededCards(open).map((card) => {
              const full = catalog.get(card.id)
              const hoverCard: HoverCard = full ?? { id: card.id, name: card.name }
              return (
                <li
                  className="pool-row"
                  key={card.id}
                  data-card-id={card.id}
                  onPointerEnter={() => warmHoverCard(hoverCard)}
                >
                  <span className="comp-need-art" aria-hidden>
                    <CardArt
                      className="comp-need-card"
                      cardId={card.id}
                      name={card.name}
                      dbfId={full?.dbfId}
                      variant="face"
                      hideIfMissing
                    />
                  </span>
                  <span className="pool-name">{card.name}</span>
                  <span className="comp-row-meta">
                    T{card.techLevel}
                    {card.role ? ` · ${card.role}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : comps.length ? (
        <>
          <div className="comp-list-meta">
            <span className="chip">{chip}</span>
          </div>
          <div className="comp-list">
            {comps.map((comp) => (
              <button
                type="button"
                className={`pool-row ${comp.status} ${comp.inLobby === false ? 'unavailable' : ''}`}
                key={comp.id}
                onClick={() => setOpenId(comp.id)}
              >
                <span className="pool-name">{comp.name}</span>
                <span className="comp-row-meta">
                  {comp.tribes.join(' · ')}
                  {comp.mechanic ? ` · ${comp.mechanic}` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="hint">{empty}</p>
      )}
      <CardHoverPreview hover={hover} />
    </section>
  )
}

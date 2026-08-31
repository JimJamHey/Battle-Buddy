import { useMemo, useRef } from 'react'
import type { BgMinion, StrategyCompView } from '../core/types'
import { CardHoverPreview, type HoverCard, warmHoverCard, useCardHover } from './CardHoverPreview'

function CardName({
  card,
  catalog
}: {
  card: { id: string; name: string }
  catalog: Map<string, BgMinion>
}) {
  const full = catalog.get(card.id)
  const hoverCard: HoverCard = full ?? { id: card.id, name: card.name }
  return (
    <span
      className="comp-card-hit"
      data-card-id={card.id}
      onPointerEnter={() => warmHoverCard(hoverCard)}
    >
      {card.name}
    </span>
  )
}

export function CompsPanel({
  comps,
  live,
  waitingForTribes,
  minions,
  embedded = false
}: {
  comps: StrategyCompView[]
  live: boolean
  waitingForTribes?: boolean
  minions: BgMinion[]
  embedded?: boolean
}) {
  const rootRef = useRef<HTMLElement>(null)
  const catalog = useMemo(() => new Map(minions.map((card) => [card.id, card])), [minions])
  const cardById = useMemo(() => {
    const map = new Map<string, HoverCard>()
    for (const comp of comps) {
      for (const card of [...comp.core, ...comp.essential, ...comp.phases.flatMap((p) => p.cards)]) {
        const full = catalog.get(card.id)
        map.set(card.id, full ?? { id: card.id, name: card.name, dbfId: full?.dbfId })
      }
    }
    return map
  }, [comps, catalog])
  const hover = useCardHover(rootRef, cardById)

  const curated = comps.some((row) => row.status === 'curated')
  const chip = waitingForTribes ? 'Waiting' : curated ? 'Curated' : 'Live pool'
  const empty = waitingForTribes
    ? 'Lobby types still resolving…'
    : live
      ? 'No live-pool comps for this lobby’s types yet.'
      : 'Join a match to filter comps by lobby tribes.'

  return (
    <section
      ref={rootRef}
      className={`panel comps-panel capture-mouse ${embedded ? 'comps-embedded' : ''}`}
    >
      <header className="panel-head">
        <h2>Comps</h2>
        {comps.length || waitingForTribes ? <span className="chip">{chip}</span> : null}
      </header>
      {comps.length ? (
        <ul className="comp-list">
          {comps.map((comp) => (
            <li className={`comp-row ${comp.status}`} key={comp.id} title={comp.notes || undefined}>
              <div className="comp-title">
                <strong>{comp.name}</strong>
                <span>
                  {comp.tribes.join(' · ')}
                  {comp.mechanic ? ` · ${comp.mechanic}` : ''}
                  {comp.status === 'curated' ? ' · curated' : ''}
                </span>
              </div>
              <p className="comp-core">
                {comp.core.map((card, i) => (
                  <span key={card.id}>
                    {i > 0 ? ' · ' : null}
                    <CardName card={card} catalog={catalog} />
                  </span>
                ))}
              </p>
              {comp.why ? <p className="comp-why">{comp.why}</p> : null}
              {comp.essential.length ? (
                <ul className="comp-essential">
                  {comp.essential.map((card) => (
                    <li key={card.id}>
                      <CardName card={card} catalog={catalog} />
                      <span>{card.role}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {comp.phases.length ? (
                <ul className="comp-phases">
                  {comp.phases.map((phase) => (
                    <li key={phase.stage}>
                      <span className={`comp-phase-label ${phase.stage}`}>
                        {phase.stage === 'early' ? 'Early' : phase.stage === 'mid' ? 'Mid' : 'End'}
                      </span>
                      <span className="comp-phase-goal">{phase.goal}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {comp.commitWhen ? <p className="comp-when">{comp.commitWhen}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{empty}</p>
      )}
      <CardHoverPreview hover={hover} />
    </section>
  )
}

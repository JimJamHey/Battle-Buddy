import { useEffect, useMemo, useRef } from 'react'
import type { BgMinion } from '../core/types'
import { groupLabel, isTierGroupTitle } from '../core/pool'
import { tribeSlug } from '../core/heroes'
import { CardArt } from './CardArt'
import { CardHoverPreview, warmHoverCard, useCardHover } from './CardHoverPreview'

function PoolThumb({ card }: { card: BgMinion }) {
  return (
    <span className="pool-thumb" aria-hidden>
      <CardArt
        className="pool-thumb-art"
        cardId={card.id}
        name={card.name}
        dbfId={card.dbfId}
        variant="face"
      />
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
  const listRef = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => {
    const map = new Map<string, BgMinion>()
    for (const group of groups) {
      for (const card of group.cards) map.set(card.id, card)
    }
    return map
  }, [groups])
  const ordered = useMemo(() => groups.flatMap((group) => group.cards), [groups])
  const hover = useCardHover(listRef, byId)

  useEffect(() => {
    const cards = ordered.slice(0, 28)
    const idle = window.setTimeout(() => {
      for (const card of cards) warmHoverCard(card)
    }, 80)
    return () => window.clearTimeout(idle)
  }, [ordered])

  const preview = <CardHoverPreview hover={hover} />

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
                  onPointerEnter={() => warmHoverCard(card)}
                >
                  <span className="pool-slice" aria-hidden>
                    <CardArt
                      className="pool-tile"
                      cardId={card.id}
                      name={card.name}
                      dbfId={card.dbfId}
                      variant="tile"
                      hideIfMissing
                    />
                  </span>
                  {showTierBubble ? <span className="pool-tier">{card.techLevel}</span> : null}
                  <PoolThumb card={card} />
                  <span className="pool-name">{card.name}</span>
                  {card.kind === 'spell' ? <span className="pool-cost">{card.cost}</span> : null}
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

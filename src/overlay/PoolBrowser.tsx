import { useEffect, useMemo, useState } from 'react'
import {
  cardAvailableInLobby,
  filterGroupsByMechanic,
  filterPoolGroups,
  groupLabel,
  mechanicsInGroups,
  showPoolTierBubbles,
  splitGroupsByTier,
  tribeAvailableInLobby,
  type PoolGroup
} from '../core/pool'
import { tribeSlug } from '../core/heroes'
import { baconPhaseLabel } from '../core/parser'
import { PoolList } from './PoolList'
import { CompsPanel } from './CompsPanel'
import type { BgMinion, StrategyCompView } from '../core/types'

export function PoolBrowser({
  groups,
  availableTribes = [],
  tribesComplete = false,
  buddyAvailable = false,
  live,
  turn,
  rawTurn,
  inCombat,
  tavernTier,
  selectedTier,
  onTier,
  comps = [],
  compsLive = false,
  waitingForTribes = false,
  minions = []
}: {
  groups: PoolGroup[]
  availableTribes?: string[]
  tribesComplete?: boolean
  buddyAvailable?: boolean
  live: boolean
  turn: number
  rawTurn: number
  inCombat: boolean
  tavernTier: number
  selectedTier: number
  onTier: (tier: number) => void
  comps?: StrategyCompView[]
  compsLive?: boolean
  waitingForTribes?: boolean
  minions?: BgMinion[]
}) {
  const [tribe, setTribe] = useState<string | null>(null)
  const [mechanic, setMechanic] = useState<string | null>(null)
  const titles = useMemo(() => groups.map((group) => group.title), [groups])
  const byTribe = useMemo(() => filterPoolGroups(groups, tribe), [groups, tribe])
  const mechanicNames = useMemo(() => mechanicsInGroups(byTribe), [byTribe])
  const visible = useMemo(() => {
    const filtered = filterGroupsByMechanic(byTribe, mechanic)
    return tribe ? splitGroupsByTier(filtered) : filtered
  }, [byTribe, mechanic, tribe])

  useEffect(() => {
    if (tribe && !titles.includes(tribe)) setTribe(null)
  }, [tribe, titles])

  useEffect(() => {
    if (mechanic && !mechanicNames.includes(mechanic)) setMechanic(null)
  }, [mechanic, mechanicNames])

  return (
    <section className="panel pool-panel capture-mouse">
      <header className="pool-nav no-drag">
        {live ? (
          <div className="pool-nav-top">
            <p className="pool-kicker">
              <strong>{baconPhaseLabel(rawTurn, inCombat, turn)}</strong>
              <span>Tavern {tavernTier || '—'}</span>
            </p>
          </div>
        ) : null}
        <div className="tier-track" role="tablist" aria-label="Tavern tier">
          <button
            type="button"
            role="tab"
            aria-selected={selectedTier === 0}
            className={`tier-tab ${selectedTier === 0 ? 'active' : ''}`}
            onClick={() => onTier(0)}
          >
            All
          </button>
          {[1, 2, 3, 4, 5, 6, 7].map((tier) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedTier === tier}
              key={tier}
              className={`tier-tab ${selectedTier === tier ? 'active' : ''} ${live && tavernTier === tier ? 'shop-tier' : ''}`}
              title={live && tavernTier === tier ? 'Your current tavern' : undefined}
              onClick={() => onTier(tier)}
            >
              {tier}
            </button>
          ))}
        </div>
        <div className="tribe-track" role="tablist" aria-label="Minion type">
          <button
            type="button"
            role="tab"
            aria-selected={tribe == null}
            className={`tribe-tab ${tribe == null ? 'active' : ''}`}
            onClick={() => setTribe(null)}
          >
            All types
          </button>
          {titles.map((title) => (
            <button
              type="button"
              role="tab"
              aria-selected={tribe === title}
              key={title}
            className={`tribe-tab tribe-${tribeSlug(title)} ${tribe === title ? 'active' : ''} ${
              tribeAvailableInLobby(title, availableTribes, buddyAvailable, tribesComplete) ? '' : 'unavailable'
            }`}
              onClick={() => setTribe((current) => (current === title ? null : title))}
            >
              {groupLabel(title)}
            </button>
          ))}
        </div>
        {mechanicNames.length ? (
          <div className="mechanic-track" role="tablist" aria-label="Mechanic">
            <button
              type="button"
              role="tab"
              aria-selected={mechanic == null}
              className={`mechanic-tab ${mechanic == null ? 'active' : ''}`}
              onClick={() => setMechanic(null)}
            >
              Any
            </button>
            {mechanicNames.map((name) => (
              <button
                type="button"
                role="tab"
                aria-selected={mechanic === name}
                key={name}
                className={`mechanic-tab ${mechanic === name ? 'active' : ''}`}
                onClick={() => setMechanic((current) => (current === name ? null : name))}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <PoolList
        groups={visible}
        showTierBubble={showPoolTierBubbles(Boolean(tribe), selectedTier)}
        cardUnavailable={(card) => !cardAvailableInLobby(card, availableTribes, buddyAvailable, tribesComplete)}
      />
      <CompsPanel
        comps={comps}
        live={compsLive}
        waitingForTribes={waitingForTribes}
        minions={minions}
        embedded
      />
    </section>
  )
}

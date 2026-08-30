import type { StrategyCompView } from '../core/types'

export function CompsPanel({ comps, live }: { comps: StrategyCompView[]; live: boolean }) {
  if (!comps.length) {
    return (
      <section className="panel comps-panel capture-mouse">
        <header className="panel-head">
          <h2>Comps</h2>
        </header>
        <p className="hint">
          {live ? 'No live-pool comps for this lobby’s types yet.' : 'Join a match to filter comps by lobby tribes.'}
        </p>
      </section>
    )
  }
  return (
    <section className="panel comps-panel capture-mouse">
      <header className="panel-head">
        <h2>Comps</h2>
        <span className="chip">{comps[0]?.status === 'curated' ? 'Curated' : 'Live pool'}</span>
      </header>
      <ul className="comp-list">
        {comps.map((comp) => (
          <li className={`comp-row ${comp.status}`} key={comp.id}>
            <div className="comp-title">
              <strong>{comp.name}</strong>
              <span>{comp.tribes.join(' · ')}</span>
            </div>
            <p className="comp-core">{comp.core.map((card) => card.name).join(' · ')}</p>
            {comp.commitWhen ? <p className="comp-when">{comp.commitWhen}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

import type { StrategyCompView } from '../core/types'

export function CompsPanel({
  comps,
  live,
  waitingForTribes
}: {
  comps: StrategyCompView[]
  live: boolean
  waitingForTribes?: boolean
}) {
  const curated = comps.some((row) => row.status === 'curated')
  const chip = waitingForTribes ? 'Waiting' : curated ? 'Curated' : 'Live pool'
  const empty = waitingForTribes
    ? 'Lobby types still resolving…'
    : live
      ? 'No live-pool comps for this lobby’s types yet.'
      : 'Join a match to filter comps by lobby tribes.'

  return (
    <section className="panel comps-panel capture-mouse">
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
              <p className="comp-core">{comp.core.map((card) => card.name).join(' · ')}</p>
              {comp.commitWhen ? <p className="comp-when">{comp.commitWhen}</p> : null}
              {comp.notes ? <p className="comp-notes">{comp.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{empty}</p>
      )}
    </section>
  )
}

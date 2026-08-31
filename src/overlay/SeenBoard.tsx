import type { BgMinion, SeenMinion } from '../core/types'
import { WarbandRow } from './Warband'

export function SeenBoardCard({
  name,
  kicker,
  minions,
  catalog
}: {
  name: string
  kicker: string
  minions: SeenMinion[]
  catalog: BgMinion[]
}) {
  return (
    <div className="seen-board">
      <header>
        <h2>{name}</h2>
        <p>{kicker}</p>
      </header>
      {minions.length ? <WarbandRow minions={minions} catalog={catalog} /> : <p className="hint">Empty board</p>}
    </div>
  )
}

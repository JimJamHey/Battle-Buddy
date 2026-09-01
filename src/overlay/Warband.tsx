import type { BgMinion, SeenMinion } from '../core/types'
import { LiveCard } from './LiveCard'

export function WarbandRow({
  minions,
  catalog,
  className,
  max = 7
}: {
  minions: SeenMinion[]
  catalog: BgMinion[]
  className?: string
  max?: number
}) {
  if (!minions.length) return null
  return (
    <div className={`warband${className ? ` ${className}` : ''}`}>
      {minions.slice(0, max).map((minion, i) => (
        <LiveCard key={`${minion.cardId}-${minion.name}-${i}`} minion={minion} catalog={catalog} />
      ))}
    </div>
  )
}

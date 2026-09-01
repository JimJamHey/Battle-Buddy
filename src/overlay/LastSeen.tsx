import type { OpponentCombatShot } from '../core/types'

export function LastSeenOpponent({ shot }: { shot: OpponentCombatShot }) {
  const who = shot.name || 'Opponent'
  return (
    <div className="last-seen">
      <p className="last-seen-kicker">
        Last vs {who}
        {shot.turn ? ` · Turn ${shot.turn}` : ''}
      </p>
      <img className="last-seen-shot" src={shot.image} alt="" draggable={false} />
    </div>
  )
}

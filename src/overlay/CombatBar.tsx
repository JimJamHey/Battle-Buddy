import type { CombatOdds } from '../core/types'
import { formatPct } from '../ui/format'

export function CombatBar({
  combat,
  vsName
}: {
  combat: CombatOdds
  vsName: string | null
}) {
  const phase = combat.simulating ? 'Simulating' : vsName ? `vs ${vsName}` : 'Combat'
  return (
    <div className="combat-bar" aria-live="polite">
      <div className="combat-side">
        <span className="combat-stat lethal" title="Chance you win and eliminate the opponent">
          LETHAL <strong>{formatPct(combat.lethal)}%</strong>
        </span>
      </div>
      <div className="combat-center">
        <span className="combat-stat win">
          WIN <strong>{formatPct(combat.win)}%</strong>
        </span>
        <span className="combat-stat tie">
          TIE <strong>{formatPct(combat.tie)}%</strong>
        </span>
        <span className="combat-stat loss">
          LOSS <strong>{formatPct(combat.loss)}%</strong>
        </span>
        <span className="combat-phase" title={vsName ?? undefined}>
          {phase}
        </span>
        {combat.partial ? (
          <span
            className="combat-partial"
            title="Some cards are missing scripts or kits — odds are an estimate"
          >
            Partial
          </span>
        ) : null}
      </div>
      <div className="combat-side right">
        <span
          className="combat-stat died"
          title="Chance you lose and take lethal damage — sent back to the lobby"
        >
          ELIM <strong>{formatPct(combat.died)}%</strong>
        </span>
      </div>
    </div>
  )
}

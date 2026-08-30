import type { CombatOdds } from '../core/types'
import { formatDamageRange, formatPct } from '../ui/format'

export function CombatBar({
  combat,
  vsName
}: {
  combat: CombatOdds
  vsName: string | null
}) {
  const phase = combat.simulating ? 'Simulating' : vsName ? `vs ${vsName}` : 'Combat'
  const partialTitle =
    'Some cards on this board have scripts the text parser cannot fully simulate. Odds are an estimate.'
  return (
    <div className="combat-bar" aria-live="polite">
      <div className="combat-side">
        <span className="combat-stat lethal" title="Chance you win and deal lethal damage">
          LETHAL <strong>{formatPct(combat.lethal)}%</strong>
        </span>
        {combat.dealtMax > 0 ? (
          <span className="combat-dmg">You deal {formatDamageRange(combat.dealtMin, combat.dealtMax)}</span>
        ) : null}
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
        <span className="combat-phase" title={combat.partial ? partialTitle : vsName ?? undefined}>
          {phase}
          {combat.partial ? (
            <abbr className="combat-partial" title={partialTitle}>
              {' '}
              · Partial
            </abbr>
          ) : null}
        </span>
      </div>
      <div className="combat-side right">
        <span className="combat-stat died" title="Chance you lose and take lethal damage">
          DEATH <strong>{formatPct(combat.died)}%</strong>
        </span>
        {combat.takenMax > 0 ? (
          <span className="combat-dmg">You take {formatDamageRange(combat.takenMin, combat.takenMax)}</span>
        ) : null}
      </div>
    </div>
  )
}

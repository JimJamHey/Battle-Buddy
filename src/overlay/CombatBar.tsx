import type { CombatOdds } from '../core/types'
import { formatPct } from '../ui/format'

function dmgRange(min: number, max: number): string {
  if (min === 0 && max === 0) return ''
  if (min === max) return String(min)
  return `${min}–${max}`
}

export function CombatBar({
  combat,
  vsName
}: {
  combat: CombatOdds
  vsName: string | null
}) {
  const isQuick = combat.simulating && combat.samples > 0 && combat.samples <= 48
  const phase = vsName ? `vs ${vsName}` : 'Combat'
  const phaseTitle = vsName ?? undefined

  const dealtLabel = dmgRange(combat.dealtMin, combat.dealtMax)
  const takenLabel = dmgRange(combat.takenMin, combat.takenMax)

  return (
    <div className={`combat-bar${isQuick ? ' combat-bar--quick' : ''}`} aria-live="polite">
      <div className="combat-side">
        <span className="combat-stat lethal" title="Chance you win and eliminate the opponent this combat">
          LETHAL <strong>{formatPct(combat.lethal)}%</strong>
        </span>
        {dealtLabel ? (
          <span className="combat-dmg" title={`Damage dealt to opponent: ${dealtLabel}`}>
            ↑ {dealtLabel}
          </span>
        ) : null}
      </div>
      <div className="combat-center">
        <span className={`combat-stat win${isQuick ? ' combat-stat--quick' : ''}`}>
          WIN <strong>{formatPct(combat.win)}%</strong>
        </span>
        <span className={`combat-stat tie${isQuick ? ' combat-stat--quick' : ''}`}>
          TIE <strong>{formatPct(combat.tie)}%</strong>
        </span>
        <span className={`combat-stat loss${isQuick ? ' combat-stat--quick' : ''}`}>
          LOSS <strong>{formatPct(combat.loss)}%</strong>
        </span>
        <span className="combat-phase" title={phaseTitle}>
          {combat.simulating ? 'Simulating…' : phase}
        </span>
      </div>
      <div className="combat-side right">
        <span
          className="combat-stat died"
          title="Chance you lose and take lethal damage this combat"
        >
          ELIM <strong>{formatPct(combat.died)}%</strong>
        </span>
        {takenLabel ? (
          <span className="combat-dmg" title={`Damage taken from opponent: ${takenLabel}`}>
            ↓ {takenLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}

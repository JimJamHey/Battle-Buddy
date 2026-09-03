import type { CombatOdds } from '../core/types'
import { formatPct } from '../ui/format'

function partialTooltip(combat: CombatOdds): string {
  if (!combat.partial) return ''
  const reasons = combat.partialReasons ?? []
  if (!reasons.length) return 'Some cards are missing scripts or kits — odds are an estimate'
  const unique = [...new Set(reasons)].slice(0, 5)
  return `Partial odds — ${unique.join('; ')}`
}

function dmgRange(min: number, max: number): string {
  if (min === 0 && max === 0) return '0'
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
  const sampleLabel = combat.samples > 0 ? ` · ${combat.samples} samples` : ''
  const phase = combat.simulating
    ? isQuick ? 'Simulating…' : 'Simulating…'
    : vsName ? `vs ${vsName}` : 'Combat'
  const phaseTitle = vsName ? `${vsName}${sampleLabel}` : sampleLabel.trim() || undefined

  return (
    <div className={`combat-bar${isQuick ? ' combat-bar--quick' : ''}`} aria-live="polite">
      <div className="combat-side">
        <span className="combat-stat lethal" title="Chance you win and eliminate the opponent this combat">
          LETHAL <strong>{formatPct(combat.lethal)}%</strong>
        </span>
        <span className="combat-dmg" title={`Damage dealt to opponent: ${dmgRange(combat.dealtMin, combat.dealtMax)}`}>
          {combat.dealtMin > 0 || combat.dealtMax > 0 ? `↑ ${dmgRange(combat.dealtMin, combat.dealtMax)}` : null}
        </span>
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
          {phase}
        </span>
        {combat.partial ? (
          <span
            className="combat-partial"
            title={partialTooltip(combat)}
            aria-label={`Partial odds — ${(combat.partialReasons ?? []).length} gap(s) detected`}
            role="status"
          >
            ⚠ Partial
          </span>
        ) : null}
      </div>
      <div className="combat-side right">
        <span
          className="combat-stat died"
          title="Chance you lose and take lethal damage this combat"
        >
          ELIM <strong>{formatPct(combat.died)}%</strong>
        </span>
        <span className="combat-dmg" title={`Damage taken from opponent: ${dmgRange(combat.takenMin, combat.takenMax)}`}>
          {combat.takenMin > 0 || combat.takenMax > 0 ? `↓ ${dmgRange(combat.takenMin, combat.takenMax)}` : null}
        </span>
      </div>
    </div>
  )
}

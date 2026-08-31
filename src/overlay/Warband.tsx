import type { BgMinion, SeenMinion } from '../core/types'
import { CardArt } from './CardArt'

function catalogCard(minion: SeenMinion, catalog: BgMinion[]): BgMinion | undefined {
  return (
    catalog.find((row) => row.id === minion.cardId) ??
    catalog.find((row) => row.name.toLowerCase() === (minion.name || '').toLowerCase())
  )
}

function tauntPoints(cx: number, cy: number, rx: number, ry: number): string {
  const n = 20
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const bump = i % 2 === 0 ? 1.2 : 1.02
    return `${(cx + Math.cos(angle) * rx * bump).toFixed(1)},${(cy + Math.sin(angle) * ry * bump).toFixed(1)}`
  }).join(' ')
}

export function WarbandRow({
  minions,
  catalog
}: {
  minions: SeenMinion[]
  catalog: BgMinion[]
}) {
  if (!minions.length) return null
  return (
    <div className="warband">
      {minions.slice(0, 7).map((minion, i) => (
        <WarbandMinion key={`${minion.cardId}-${minion.name}-${i}`} minion={minion} catalog={catalog} />
      ))}
    </div>
  )
}

function WarbandMinion({ minion, catalog }: { minion: SeenMinion; catalog: BgMinion[] }) {
  const card = catalogCard(minion, catalog)
  const boosted = card != null && (minion.attack > card.attack || minion.health > card.health)
  const classes = [
    'warband-minion',
    minion.taunt ? 'is-taunt' : '',
    minion.divineShield ? 'is-divine' : '',
    minion.reborn ? 'is-reborn' : '',
    minion.venomous ? 'is-venomous' : '',
    minion.golden ? 'is-golden' : '',
    boosted ? 'is-boosted' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} title={minion.name}>
      <svg className="warband-shell" viewBox="0 0 120 150" aria-hidden="true">
        {minion.taunt ? (
          <polygon
            className="warband-taunt"
            points={tauntPoints(60, 58, 44, 54)}
          />
        ) : null}
        {minion.reborn ? (
          <ellipse className="warband-reborn" cx="60" cy="18" rx="28" ry="16" />
        ) : null}
        {minion.golden ? <ellipse className="warband-gold-glow" cx="60" cy="58" rx="46" ry="56" /> : null}
        {minion.divineShield ? (
          <ellipse className="warband-divine" cx="60" cy="58" rx="43" ry="53" />
        ) : null}
      </svg>
      <span className="warband-face">
        {minion.cardId ? (
          <CardArt className="warband-art" cardId={minion.cardId} variant="face" />
        ) : (
          <span className="warband-art missing" />
        )}
      </span>
      <svg className="warband-rim" viewBox="0 0 120 150" aria-hidden="true">
        <ellipse className="warband-ring-outer" cx="60" cy="58" rx="41" ry="51" />
        <ellipse className="warband-ring-inner" cx="60" cy="58" rx="37.5" ry="47.5" />
      </svg>
      <span className={`warband-gem atk${boosted ? ' boosted' : ''}`}>{minion.attack}</span>
      <span className={`warband-gem hp${boosted ? ' boosted' : ''}`}>{minion.health}</span>
    </div>
  )
}

import type { BgMinion, SeenMinion } from '../core/types'
import { catalogForSeen, isGainedKeyword, liveTone, printedStats } from '../core/liveStats'
import { goldenCardId } from '../core/cards'
import { CardArt } from './CardArt'

const FLAGS: Array<{
  key: keyof SeenMinion
  label: string
  className: string
  mechanics: string[]
}> = [
  { key: 'taunt', label: 'Taunt', className: 'taunt', mechanics: ['Taunt'] },
  { key: 'divineShield', label: 'Divine Shield', className: 'divine', mechanics: ['Divine Shield'] },
  { key: 'reborn', label: 'Reborn', className: 'reborn', mechanics: ['Reborn'] },
  { key: 'venomous', label: 'Venomous', className: 'venomous', mechanics: ['Venomous', 'Poisonous'] },
  { key: 'windfury', label: 'Windfury', className: 'windfury', mechanics: ['Windfury'] },
  { key: 'stealth', label: 'Stealth', className: 'stealth', mechanics: ['Stealth'] },
  { key: 'deathrattle', label: 'Deathrattle', className: 'deathrattle', mechanics: ['Deathrattle'] }
]

export function LiveCard({ minion, catalog }: { minion: SeenMinion; catalog: BgMinion[] }) {
  const card = catalogForSeen(minion, catalog)
  const golden = Boolean(minion.golden)
  const printed = printedStats(card, golden)
  const atkTone = liveTone(minion.attack, printed?.attack, 'atk')
  const hpTone = liveTone(minion.health, printed?.health, 'hp')
  const artId = golden ? goldenCardId(minion.cardId, card?.goldenId) : minion.cardId
  const gained = (flag: boolean, ...mechanics: string[]) => isGainedKeyword(flag, card, ...mechanics)
  const flags = FLAGS.filter((flag) => gained(Boolean(minion[flag.key]), ...flag.mechanics))
  const classes = [
    'live-card',
    golden ? 'is-golden' : '',
    gained(Boolean(minion.taunt), 'Taunt') ? 'is-taunt' : '',
    minion.divineShield ? 'is-divine' : '',
    minion.stealth ? 'is-stealth' : '',
    gained(Boolean(minion.reborn), 'Reborn') ? 'is-reborn' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} title={minion.name}>
      {minion.cardId ? (
        <CardArt
          className="live-card-art"
          cardId={artId}
          name={minion.name || card?.name}
          dbfId={card?.dbfId}
          variant={golden ? 'golden' : 'render'}
          hideIfMissing
        />
      ) : (
        <span className="live-card-art missing" />
      )}
      {flags.length ? (
        <span className="live-card-flags">
          {flags.map((flag) => (
            <span key={flag.key} className={`live-card-flag ${flag.className}`} title={flag.label} />
          ))}
        </span>
      ) : null}
      <span className={`live-card-gem atk${atkTone ? ` ${atkTone}` : ''}`}>{minion.attack}</span>
      <span className={`live-card-gem hp${hpTone ? ` ${hpTone}` : ''}`}>{minion.health}</span>
    </div>
  )
}

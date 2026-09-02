import type { OverlaySnapshot, SessionGame } from '../core/types'
import { averageFinish, gamesToday, MAX_RECENT_GAMES } from '../core/session'
import { formatDelta, ordinal, placeClass, ratingLabel, selfRating } from '../ui/format'
import { CardArt } from './CardArt'

function deltaClass(delta: number | null | undefined): string {
  if (delta == null) return 'session-game-delta'
  if (delta > 0) return 'session-game-delta delta-up'
  if (delta < 0) return 'session-game-delta delta-down'
  return 'session-game-delta'
}

export function SessionRail({
  state,
  live,
  watching,
  onHoverGame
}: {
  state: OverlaySnapshot
  live: boolean
  watching: boolean
  onHoverGame: (index: number | null) => void
}) {
  const today = gamesToday(state.session)
  const recent = [...today].slice(-MAX_RECENT_GAMES).reverse()
  const avg = averageFinish(state.session)
  const start = state.session.startMmr
  const current = selfRating(state)
  const todayDelta = current != null && start != null ? current - start : null

  return (
    <section className="panel session-panel capture-mouse">
      <header className="panel-head">
        <div className="session-head-copy">
          <h2>
            {live && watching
              ? state.match.spectatedName || 'Spectating'
              : live && state.match.heroName
                ? state.match.heroName
                : 'Session'}
          </h2>
          {live && watching && state.match.heroName ? (
            <p className="session-hero-sub">{state.match.heroName}</p>
          ) : null}
        </div>
        <span className={`chip ${live ? (watching ? 'watch' : 'live') : ''}`}>
          {live ? (watching ? 'Watching' : 'Live') : 'Idle'}
        </span>
      </header>
      <div className="mmr-block">
        <p className="session-section-label">MMR</p>
        <div className="mmr-grid">
          <div>
            <span>Start</span>
            <strong>{start == null ? '—' : start.toLocaleString('en-US')}</strong>
          </div>
          <div>
            <span>Current</span>
            <strong>{ratingLabel(state)}</strong>
          </div>
        </div>
      </div>
      <div className="stat-pills">
        <span>{today.length} games</span>
        <span>{avg == null ? 'Avg place —' : `Avg place ${avg}`}</span>
        {todayDelta != null ? (
          <span className={todayDelta > 0 ? 'delta-up' : todayDelta < 0 ? 'delta-down' : ''}>
            {formatDelta(todayDelta)}
          </span>
        ) : null}
      </div>
      {selfRating(state) == null && !state.match.spectating ? (
        <p className="hint">Open the Battlegrounds Play screen so we can read your rating.</p>
      ) : null}
      {state.status.ratingOcr?.failed ? (
        <p className="hint">Could not read rating after the last game. Check the Play screen or set it in Settings.</p>
      ) : null}
      <div className="session-games capture-mouse">
        <p className="session-section-label">Latest Games</p>
        <div className="session-games-cols">
          <span>Hero</span>
          <span>Place</span>
          <span>MMR</span>
        </div>
        {recent.length ? (
          recent.map((game, i) => (
            <GameRow key={game.matchKey || `${game.endedAt}-${i}`} game={game} onHover={() => onHoverGame(i)} onLeave={() => onHoverGame(null)} />
          ))
        ) : (
          <p className="session-games-empty">No games yet today</p>
        )}
      </div>
    </section>
  )
}

function GameRow({
  game,
  onHover,
  onLeave
}: {
  game: SessionGame
  onHover: () => void
  onLeave: () => void
}) {
  const label = `${game.heroName || 'Battlegrounds'}, ${ordinal(game.placement)}, ${formatDelta(game.mmrDelta)}`
  return (
    <div
      className="session-game"
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      aria-label={label}
    >
      <span className="session-game-hero">
        {game.heroCardId ? (
          <CardArt
            className="session-game-face"
            cardId={game.heroCardId}
            variant="portrait"
            name={game.heroName ?? undefined}
            hideIfMissing
          />
        ) : null}
        <span className="session-game-hero-name">{game.heroName || 'Battlegrounds'}</span>
      </span>
      <span className={`session-game-place ${placeClass(game.placement)}`}>{ordinal(game.placement)}</span>
      <span className={deltaClass(game.mmrDelta)}>{formatDelta(game.mmrDelta)}</span>
    </div>
  )
}

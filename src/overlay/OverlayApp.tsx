import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_OVERLAY_LAYOUT, type BgMinion, type OverlayLayout, type OverlayPos, type OverlaySnapshot, type SeenMinion } from '../core/types'
import { groupPoolCards, minionsForTier } from '../core/pool'
import { formatBuffValue } from '../core/buffs'
import { gamesToday, MAX_RECENT_GAMES } from '../core/session'
import { normalizeName } from '../core/parser'
import { heroHasBuddy } from '../core/cards'
import { combatOpponentLabel, formatDelta, formatPct, ordinal, placeClass, ratingLabel, selfRating } from '../ui/format'
import { UpdateBanner } from '../ui/UpdateBanner'
import { CardArt } from './CardArt'
import { DraggablePanel } from './DraggablePanel'
import { PoolBrowser } from './PoolBrowser'
import { CompsPanel } from './CompsPanel'
import { WarbandRow } from './Warband'

export function OverlayApp() {
  const [state, setState] = useState<OverlaySnapshot | null>(null)
  const [layout, setLayout] = useState<OverlayLayout>(DEFAULT_OVERLAY_LAYOUT)
  const dragging = useRef(false)
  const [hoverGame, setHoverGame] = useState<number | null>(null)

  useEffect(() => {
    void window.battleBuddy.getState().then(setState)
    return window.battleBuddy.onState(setState)
  }, [])

  useEffect(() => {
    if (!state || dragging.current) return
    setLayout(state.settings.overlayLayout)
  }, [state?.settings.overlayLayout])

  const unlocked = Boolean(state?.settings.layoutUnlocked)

  useEffect(() => {
    let last = true
    const send = (pass: boolean) => {
      if (pass === last) return
      last = pass
      window.battleBuddy.setClickThrough(pass)
    }
    const onMove = (event: MouseEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const over = Boolean(hit instanceof Element && hit.closest('.capture-mouse'))
      send(!over)
    }
    const passThrough = () => send(true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('mouseleave', passThrough)
    window.addEventListener('blur', passThrough)
    send(true)
    return () => {
      send(true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseleave', passThrough)
      window.removeEventListener('blur', passThrough)
    }
  }, [])

  const lobbyTribes = useMemo(() => {
    if (!state?.match.gameActive) return []
    const known = state.match.availableTribes
    return known.length ? known : []
  }, [state])
  const poolGroups = useMemo(() => {
    if (!state) return []
    return groupPoolCards(minionsForTier(state.minions, state.selectedTier, 0), lobbyTribes)
  }, [state, lobbyTribes])

  if (!state || !state.overlayVisible) return null

  const today = gamesToday(state.session)
  const recent = [...today].slice(-MAX_RECENT_GAMES).reverse()
  const avg = today.length
    ? Math.round((today.reduce((a, g) => a + g.placement, 0) / today.length) * 10) / 10
    : '—'
  const start = state.session.startMmr
  const current = selfRating(state)
  const todayDelta = current != null && start != null ? current - start : null
  const live = state.match.gameActive
  const buddyAvailable =
    !live || lobbyTribes.includes('Buddy') || heroHasBuddy(state.match.heroCardId, state.minions)
  const tribesComplete = Boolean(state.match.tribesComplete)
  const hoveredGame = hoverGame != null ? recent[hoverGame] ?? null : null
  const vsName = combatOpponentLabel(state.combat, state.lobbyMmr)
  const watching = Boolean(
    live &&
      state.match.spectating &&
      state.match.spectatedName &&
      normalizeName(state.match.spectatedName) !== normalizeName(state.settings.battleTag || '')
  )
  const showCombat = (live && Boolean(state.match.heroName || state.match.heroCardId || state.match.inCombat)) || unlocked
  const showSession = state.settings.showSessionOnOverlay || live
  const showHud = showSession
  const interact = (inside: boolean) => {
    if (unlocked) {
      window.battleBuddy.setClickThrough(false)
      return
    }
    window.battleBuddy.setClickThrough(!inside)
  }

  const movePanel = (key: keyof OverlayLayout, pos: OverlayPos) => {
    dragging.current = true
    setLayout((prev) => ({ ...prev, [key]: pos }))
  }
  const savePanel = (key: keyof OverlayLayout, pos: OverlayPos) => {
    setLayout((prev) => {
      const next = { ...prev, [key]: pos }
      void window.battleBuddy.setSettings({ overlayLayout: next }).finally(() => {
        dragging.current = false
      })
      return next
    })
  }

  return (
    <div
      className={`overlay-root ${unlocked ? 'unlocked' : ''}`}
      style={{ opacity: state.settings.overlayOpacity / 100 }}
    >
      <div className="toast-stack">
        <UpdateBanner update={state.update} compact onPointer={interact} />
        {state.status.banner ? (
          <div
            className="notice interactive capture-mouse"
            onMouseEnter={() => interact(true)}
            onMouseLeave={() => interact(false)}
          >
            {state.status.banner}
          </div>
        ) : null}
        {state.status.displayMode === 'exclusive' ? (
          <div
            className="notice interactive capture-mouse"
            onMouseEnter={() => interact(true)}
            onMouseLeave={() => interact(false)}
          >
            Switching Hearthstone to borderless fullscreen so the overlay can stay on top.
          </div>
        ) : null}
      </div>
      {unlocked ? (
        <div className="layout-hint interactive capture-mouse">
          Drag a panel to place it · Ctrl+Shift+L to lock
        </div>
      ) : null}

      {showCombat ? (
        <DraggablePanel
          className="combat-float"
          pos={layout.combat}
          unlocked={unlocked}
          onMove={(pos) => movePanel('combat', pos)}
          onMoveEnd={(pos) => savePanel('combat', pos)}
          onInteract={interact}
        >
          {live && state.match.inCombat && (state.combat.active || state.combat.simulating) ? (
            <div className="combat-bar">
              <div className="combat-side">
                <span className="combat-stat lethal">
                  LETHAL <strong>{formatPct(state.combat.lethal)}%</strong>
                </span>
              </div>
              <div className="combat-center">
                <span className="combat-stat win">
                  WIN <strong>{formatPct(state.combat.win)}%</strong>
                </span>
                <span className="combat-stat tie">
                  TIE <strong>{formatPct(state.combat.tie)}%</strong>
                </span>
                <span className="combat-stat loss">
                  LOSS <strong>{formatPct(state.combat.loss)}%</strong>
                </span>
                <span className="combat-phase">
                  {state.combat.simulating
                    ? 'Simulating'
                    : vsName
                      ? `vs ${vsName}`
                      : 'Combat'}
                  {state.combat.partial ? ' · Partial' : ''}
                </span>
              </div>
              <div className="combat-side right">
                <span className="combat-stat died">
                  LETHAL <strong>{formatPct(state.combat.died)}%</strong>
                </span>
              </div>
            </div>
          ) : live && (state.match.heroName || state.match.heroCardId) ? (
            <div className="combat-bar waiting">Waiting for combat</div>
          ) : (
            <div className="combat-bar placeholder">Combat odds — drag to place</div>
          )}
        </DraggablePanel>
      ) : null}

      {showHud || unlocked ? (
        <DraggablePanel
          className="rail"
          pos={layout.rail}
          unlocked={unlocked}
          width="min(300px, 26vw)"
          onMove={(pos) => movePanel('rail', pos)}
          onMoveEnd={(pos) => savePanel('rail', pos)}
          onInteract={interact}
        >
          {showSession ? (
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
                <span>{avg === '—' ? 'Avg —' : `Avg ${avg}`}</span>
                {todayDelta != null ? (
                  <span className={todayDelta > 0 ? 'delta-up' : todayDelta < 0 ? 'delta-down' : ''}>
                    {formatDelta(todayDelta)}
                  </span>
                ) : null}
              </div>
              {selfRating(state) == null && !state.match.spectating ? (
                <p className="hint">Stay on the Battlegrounds Play screen so we can read Rating from the client.</p>
              ) : null}
              <div className="session-games capture-mouse">
                <p className="session-section-label">Latest Games</p>
                <div className="session-games-cols" aria-hidden="true">
                  <span>Hero</span>
                  <span>Place</span>
                  <span>MMR</span>
                </div>
                {recent.length ? (
                  recent.map((game, i) => (
                    <div
                      className="session-game"
                      key={game.matchKey || `${game.endedAt}-${i}`}
                      onPointerEnter={() => setHoverGame(i)}
                      onPointerLeave={() => setHoverGame((current) => (current === i ? null : current))}
                    >
                      <span className="session-game-hero">
                        {game.heroCardId ? (
                          <CardArt
                            className="session-game-face"
                            cardId={game.heroCardId}
                            variant="portrait"
                            hideIfMissing
                          />
                        ) : null}
                        <span className="session-game-hero-name">{game.heroName || 'Battlegrounds'}</span>
                      </span>
                      <span className={`session-game-place ${placeClass(game.placement)}`}>
                        {ordinal(game.placement)}
                      </span>
                      <span className={deltaClass(game.mmrDelta)}>
                        {formatDelta(game.mmrDelta)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="session-games-empty">No games yet today</p>
                )}
              </div>
            </section>
          ) : unlocked && !showHud ? (
            <section className="panel session-panel">
              <p className="hint">Session — drag Move to place</p>
            </section>
          ) : null}
          {state.match.buffs?.length ? (
            <div className="buff-dock capture-mouse">
              {state.match.buffs.map((buff) => (
                <div className={`buff-tag buff-${buff.key} capture-mouse`} key={buff.key} title={buff.label}>
                  <CardArt className="buff-art" cardId={buff.iconCardId} variant="portrait" hideIfMissing />
                  <strong>{formatBuffValue(buff)}</strong>
                </div>
              ))}
            </div>
          ) : null}
          <CompsPanel comps={state.strategies ?? []} live={live} />
        </DraggablePanel>
      ) : null}

      <DraggablePanel
        className="pool"
        pos={layout.pool}
        unlocked={unlocked}
        width="min(300px, 26vw)"
        onMove={(pos) => movePanel('pool', pos)}
        onMoveEnd={(pos) => savePanel('pool', pos)}
        onInteract={interact}
      >
        {state.minions.length ? (
          <PoolBrowser
            groups={poolGroups}
            availableTribes={lobbyTribes}
            tribesComplete={tribesComplete}
            buddyAvailable={buddyAvailable}
            live={live}
            turn={state.match.turn}
            rawTurn={state.match.rawTurn}
            inCombat={state.match.inCombat}
            tavernTier={live ? state.match.tavernTier : 0}
            selectedTier={state.selectedTier}
            remaining={state.poolRemaining}
            onTier={(tier) => window.battleBuddy.setTier(tier)}
          />
        ) : (
          <section className="panel pool-panel">
            <p className="hint">Loading minion pool…</p>
          </section>
        )}
      </DraggablePanel>
      {hoveredGame
        ? createPortal(
            <SeenBoardCard
              name={hoveredGame.heroName || 'Your board'}
              kicker={hoveredGame.board?.length ? `Final board · Turn ${hoveredGame.turn}` : 'No board saved'}
              minions={hoveredGame.board ?? []}
              catalog={state.minions}
            />,
            document.body
          )
        : null}
    </div>
  )
}

function deltaClass(delta: number | null | undefined): string {
  if (delta == null) return 'session-game-delta'
  if (delta > 0) return 'session-game-delta delta-up'
  if (delta < 0) return 'session-game-delta delta-down'
  return 'session-game-delta'
}

function SeenBoardCard({
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
      <WarbandRow minions={minions} catalog={catalog} />
    </div>
  )
}

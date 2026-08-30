import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_OVERLAY_LAYOUT, type OverlayLayout, type OverlayPos, type OverlaySnapshot } from '../core/types'
import { groupPoolCards, minionsForTier } from '../core/pool'
import { formatBuffValue } from '../core/buffs'
import { gamesToday, MAX_RECENT_GAMES } from '../core/session'
import { normalizeName } from '../core/parser'
import { heroHasBuddy } from '../core/cards'
import { combatOpponentLabel } from '../ui/format'
import { UpdateBanner } from '../ui/UpdateBanner'
import { CardArt } from './CardArt'
import { CombatBar } from './CombatBar'
import { DraggablePanel } from './DraggablePanel'
import { PoolBrowser } from './PoolBrowser'
import { CompsPanel } from './CompsPanel'
import { SessionRail } from './SessionRail'
import { SeenBoardCard } from './SeenBoard'
import { useClickThrough } from './useClickThrough'

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
  useClickThrough()

  const live = Boolean(state?.match.gameActive)
  const lobbyTribes = useMemo(() => {
    if (!state?.match.gameActive) return []
    return state.match.availableTribes
  }, [state?.match.gameActive, state?.match.availableTribes])
  const poolGroups = useMemo(() => {
    if (!state) return []
    return groupPoolCards(minionsForTier(state.minions, state.selectedTier, 0), lobbyTribes)
  }, [state?.minions, state?.selectedTier, lobbyTribes])

  if (!state || !state.overlayVisible) return null

  const today = gamesToday(state.session)
  const recent = [...today].slice(-MAX_RECENT_GAMES).reverse()
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
        <UpdateBanner update={state.update} compact />
          {state.status.banner ? <div className="notice interactive capture-mouse">{state.status.banner}</div> : null}
      </div>
      {unlocked ? (
        <div className="layout-hint interactive capture-mouse" role="status">
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
          {live && state.match.inCombat ? (
            state.combat.active || state.combat.simulating ? (
              <CombatBar combat={state.combat} vsName={vsName} />
            ) : (
              <div className="combat-bar waiting">Calculating combat…</div>
            )
          ) : live && (state.match.heroName || state.match.heroCardId) ? (
            <div className="combat-bar waiting">Waiting for combat</div>
          ) : (
            <div className="combat-bar placeholder">Combat odds — drag to place</div>
          )}
        </DraggablePanel>
      ) : null}

      {showSession || unlocked ? (
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
            <SessionRail state={state} live={live} watching={watching} onHoverGame={setHoverGame} />
          ) : (
            <section className="panel session-panel">
              <p className="hint">Session — drag Move to place</p>
            </section>
          )}
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
          <CompsPanel
            comps={state.strategies ?? []}
            live={live}
            waitingForTribes={live && !tribesComplete}
          />
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
            onTier={(tier) => window.battleBuddy.setTier(tier)}
          />
        ) : (
          <section className="panel pool-panel">
            <p className="hint">
              {state.status.cardsError
                ? `Could not load the minion pool: ${state.status.cardsError}`
                : 'Loading minion pool…'}
            </p>
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

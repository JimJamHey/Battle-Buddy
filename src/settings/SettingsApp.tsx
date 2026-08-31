import { useEffect, useRef, useState } from 'react'
import { DEFAULT_OVERLAY_LAYOUT, type AppSettings, type OverlaySnapshot } from '../core/types'
import { THEMES } from '../core/theme'
import { formatDelta, formatMmr, ordinal, placeClass } from '../ui/format'
import { averageFinish, gamesToday } from '../core/session'
import { UpdateBanner } from '../ui/UpdateBanner'
import logoUrl from './logo.png'

export function SettingsApp() {
  const [state, setState] = useState<OverlaySnapshot | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const tagTimer = useRef<number | null>(null)

  useEffect(() => {
    void window.battleBuddy.getState().then(setState)
    return window.battleBuddy.onState(setState)
  }, [])

  useEffect(() => {
    if (state) setTagDraft(state.settings.battleTag)
  }, [state?.settings.battleTag])

  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? 'buddy'
    document.body.style.background = ''
  }, [state?.settings.theme])

  if (!state) {
    return (
      <div className="settings-root">
        <header className="settings-hero">
          <div className="settings-hero-brand">
            <img className="settings-logo" src={logoUrl} alt="" />
            <div>
              <p className="eyebrow">BattleBuddy</p>
              <h1>Starting…</h1>
            </div>
          </div>
        </header>
      </div>
    )
  }

  const patch = (next: Partial<AppSettings>) => {
    void window.battleBuddy.setSettings(next)
  }

  const commitTag = (value: string) => {
    if (value === state.settings.battleTag) return
    patch({ battleTag: value })
  }

  const statusClass = state.status.hearthstoneFound
    ? state.status.logsLive
      ? 'status-ok'
      : 'status-wait'
    : 'status-wait'
  const today = gamesToday(state.session)
  const avg = averageFinish(state.session)
  const checking = state.update.phase === 'checking'

  return (
    <div className="settings-root">
      <UpdateBanner update={state.update} />

      <header className="settings-hero">
        <div className="settings-hero-brand">
          <img className="settings-logo" src={logoUrl} alt="" />
          <div>
            <p className="eyebrow">Battlegrounds overlay</p>
            <h1>BattleBuddy</h1>
            <p className="lede">Launch anytime. The overlay follows the Hearthstone window.</p>
          </div>
        </div>
        <span className="version-pill">v{state.update.currentVersion}</span>
      </header>

      <section className="card">
        <h2>Status</h2>
        <p className={statusClass}>
          {state.status.hearthstoneFound ? 'Hearthstone found' : 'Waiting for Hearthstone'}
          {state.status.hearthstoneFocused ? ' · focused' : ''}
        </p>
        <p className="hint">Install: {state.status.installPath || '—'}</p>
        <p className="hint">Logs: {state.status.logsDirectory || '—'}</p>
        <p className="hint">
          Live tracking: {state.status.logsLive ? 'yes' : 'no'}
          {state.status.needsHearthstoneRestart ? ' — restart Hearthstone' : ''}
        </p>
        <p className="hint">
          Cards: {state.status.cardCount} · Leaderboard: {state.status.leaderboardCount} players cached
        </p>
        {state.status.cardsError ? <p className="status-bad">{state.status.cardsError}</p> : null}
        {state.status.banner ? <p className="status-bad">{state.status.banner}</p> : null}
        {state.status.lastError ? <p className="status-bad">{state.status.lastError}</p> : null}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ghost" type="button" onClick={() => void window.battleBuddy.openLogs()}>
            Open logs folder
          </button>
          <button className="ghost" type="button" onClick={() => void window.battleBuddy.refreshLeaderboard()}>
            Refresh leaderboard
          </button>
          <button className="ghost danger" type="button" onClick={() => window.battleBuddy.quit()}>
            Quit BattleBuddy
          </button>
        </div>
        <p className="hint">Close this window or Quit to exit. Minimize it to keep the overlay running.</p>
      </section>

      <section className="card">
        <h2>Updates</h2>
        <p className="hint">
          {checking
            ? 'Checking GitHub…'
            : state.update.phase === 'unavailable'
              ? `You're on v${state.update.currentVersion}.`
              : `Installed version v${state.update.currentVersion}.`}
          {state.update.canInstall
            ? ' Installed copies check the rolling test release as well as numbered tags.'
            : ''}
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="primary"
            type="button"
            disabled={checking}
            onClick={() => void window.battleBuddy.checkUpdate()}
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Overlay</h2>
        <label className="toggle">
          <span>Show overlay</span>
          <input
            type="checkbox"
            checked={state.settings.overlayEnabled}
            onChange={(e) => patch({ overlayEnabled: e.target.checked })}
          />
        </label>
        <label className="toggle">
          <span>Keep overlay visible in fullscreen</span>
          <input
            type="checkbox"
            checked={state.settings.keepFullscreenOverlay}
            onChange={(e) => patch({ keepFullscreenOverlay: e.target.checked })}
          />
        </label>
        <label className="toggle">
          <span>Hide when Hearthstone is not focused</span>
          <input
            type="checkbox"
            checked={state.settings.hideWhenUnfocused}
            onChange={(e) => patch({ hideWhenUnfocused: e.target.checked })}
          />
        </label>
        <label className="toggle">
          <span>Session stats on overlay</span>
          <input
            type="checkbox"
            checked={state.settings.showSessionOnOverlay}
            onChange={(e) => patch({ showSessionOnOverlay: e.target.checked })}
          />
        </label>
        <label className="toggle">
          <span>Unlock overlay (drag panels)</span>
          <input
            type="checkbox"
            checked={state.settings.layoutUnlocked}
            onChange={(e) => patch({ layoutUnlocked: e.target.checked })}
          />
        </label>
        <p className="hint">
          {state.status.displayMode === 'exclusive'
            ? 'Hearthstone is in fullscreen — switching it so the overlay can sit on the game.'
            : state.status.displayMode === 'borderless'
              ? 'Borderless fullscreen — overlay follows the game window.'
              : 'Windowed — overlay follows the Hearthstone window in any size.'}
        </p>
        <div className="row" style={{ marginTop: 4, marginBottom: 10 }}>
          <button className="ghost" type="button" onClick={() => patch({ overlayLayout: DEFAULT_OVERLAY_LAYOUT })}>
            Reset layout
          </button>
        </div>
        <label htmlFor="opacity">Opacity ({state.settings.overlayOpacity}%)</label>
        <input
          id="opacity"
          type="number"
          min={40}
          max={100}
          value={state.settings.overlayOpacity}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            patch({ overlayOpacity: Math.min(100, Math.max(40, n)) })
          }}
        />
        <p className="hint" style={{ marginTop: 10 }}>Theme</p>
        <div className="theme-toggles" role="group" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={state.settings.theme === theme.id}
              className={state.settings.theme === theme.id ? 'active' : ''}
              onClick={() => patch({ theme: theme.id })}
            >
              {theme.name}
            </button>
          ))}
        </div>
        <label htmlFor="region">Leaderboard region</label>
        <select
          id="region"
          value={state.settings.region}
          onChange={(e) => patch({ region: e.target.value as AppSettings['region'] })}
        >
          <option value="US">Americas (US)</option>
          <option value="EU">Europe (EU)</option>
          <option value="AP">Asia-Pacific (AP)</option>
        </select>
        <label htmlFor="battletag">BattleTag</label>
        <input
          id="battletag"
          type="text"
          value={tagDraft}
          placeholder="Name#1234"
          onChange={(e) => {
            const value = e.target.value
            setTagDraft(value)
            if (tagTimer.current) window.clearTimeout(tagTimer.current)
            tagTimer.current = window.setTimeout(() => commitTag(value), 400)
          }}
          onBlur={() => commitTag(tagDraft)}
        />
        <p className="hint">
          Rating is read from the Battlegrounds Play screen after a game. Other players’ ratings are
          not available in the client.
        </p>
        <label htmlFor="path">Hearthstone folder</label>
        <div className="row">
          <input id="path" type="text" value={state.settings.hearthstonePath} readOnly />
          <button
            className="primary"
            type="button"
            onClick={async () => {
              const folder = await window.battleBuddy.pickFolder()
              if (folder) patch({ hearthstonePath: folder })
            }}
          >
            Browse
          </button>
        </div>
        <p className="hint">
          {state.status.cardsError
            ? `Minion catalog failed to load: ${state.status.cardsError}`
            : 'Combat odds on top. Hands and trinkets are included when Power.log prints them. Click tavern 1–7 to peek a tier.'}
        </p>
      </section>

      <section className="card">
        <h2>Today</h2>
        <p>
          {today.length} games
          {avg != null ? ` · avg place ${avg}` : ''}
          {state.session.startMmr != null ? ` · start ${formatMmr(state.session.startMmr)}` : ''}
        </p>
        {today.length ? (
          <ol className="games">
            {today
              .slice()
              .reverse()
              .map((game, i) => (
                <li key={`${game.endedAt}-${i}`}>
                  <span className={placeClass(game.placement)}>{ordinal(game.placement)}</span>
                  {game.heroName ? <span> · {game.heroName}</span> : null}
                  <span> · turn {game.turn}</span>
                  {game.mmrDelta != null ? <span> · {formatDelta(game.mmrDelta)}</span> : null}
                </li>
              ))}
          </ol>
        ) : (
          <p className="hint">No games recorded today yet.</p>
        )}
      </section>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_OVERLAY_LAYOUT, type AppSettings, type OverlaySnapshot } from '../core/types'
import { THEMES } from '../core/theme'
import { formatDelta, formatMmr, ordinal, placeClass, ratingOcrLabel } from '../ui/format'
import { averageFinish, gamesToday } from '../core/session'
import { UpdateBanner } from '../ui/UpdateBanner'
import type { MemoryProbeReport } from '../core/types'
import { describeProbe } from '../core/ratingSource'
import logoUrl from './logo.png'

export function SettingsApp() {
  const [state, setState] = useState<OverlaySnapshot | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [probe, setProbe] = useState<MemoryProbeReport | null>(null)
  const [probing, setProbing] = useState(false)
  const tagTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!window.battleBuddy) return
    void window.battleBuddy.getState().then(setState)
    return window.battleBuddy.onState(setState)
  }, [])

  useEffect(() => {
    if (state) setTagDraft(state.settings.battleTag)
  }, [state?.settings.battleTag])

  useEffect(() => {
    document.documentElement.dataset.theme = state?.settings.theme ?? 'hearth'
    document.body.style.background = ''
  }, [state?.settings.theme])

  if (!state || state.bootstrap.phase === 'loading') {
    const progress = state?.bootstrap.progress ?? 8
    const message = state?.bootstrap.message ?? 'Starting\u2026'
    return (
      <div className="settings-root settings-loading">
        <header className="settings-hero">
          <div className="settings-hero-brand">
            <img className="settings-logo" src={logoUrl} alt="" />
            <div>
              <p className="eyebrow">BattleBuddy</p>
              <h1>Starting\u2026</h1>
            </div>
          </div>
        </header>
        <div className="bootstrap-panel card">
          <p className="bootstrap-message">{message}</p>
          <div className="bootstrap-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="bootstrap-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
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
          {state.status.hearthstoneFound
            ? state.status.logsLive
              ? 'Connected \u2014 tracking your games'
              : 'Hearthstone found \u2014 open a Battlegrounds game to start tracking'
            : 'Waiting for Hearthstone\u2026'}
        </p>
        <p className="hint">Install: {state.status.installPath || '—'}</p>
        <p className="hint">
          Live tracking: {state.status.logsLive ? 'yes' : 'no'}
          {state.status.needsHearthstoneRestart ? ' — restart Hearthstone' : ''}
        </p>
        {state.status.cardsError ? <p className="status-bad">{state.status.cardsError}</p> : null}
        {state.status.banner ? <p className="status-bad">{state.status.banner}</p> : null}
        {state.status.lastError ? <p className="status-bad">{state.status.lastError}</p> : null}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ghost" type="button" onClick={() => void window.battleBuddy.refreshLeaderboard()}>
            Refresh leaderboard
          </button>
          <button className="ghost danger" type="button" onClick={() => window.battleBuddy.quit()}>
            Quit BattleBuddy
          </button>
        </div>
        <p className="hint">Minimize this window to keep the overlay running in the background.</p>
      </section>

      <section className="card">
        <h2>Updates</h2>
        <p className="hint">
          {checking
            ? 'Checking GitHub…'
            : `Installed version v${state.update.currentVersion}.`}
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="primary"
            type="button"
            disabled={checking}
            onClick={() => void window.battleBuddy.checkUpdate()}
          >
            {checking ? 'Checking\u2026' : 'Check for updates'}
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
          <span>Unlock combat bar position</span>
          <input
            type="checkbox"
            checked={state.settings.layoutUnlocked}
            onChange={(e) => patch({ layoutUnlocked: e.target.checked })}
          />
        </label>
        <div className="row" style={{ marginTop: 4, marginBottom: 10 }}>
          <button
            className="ghost"
            type="button"
            onClick={() =>
              patch({
                overlayLayout: DEFAULT_OVERLAY_LAYOUT,
                layoutUnlocked: false
              })
            }
          >
            Reset overlay layout
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
              data-theme-id={theme.id}
              data-theme-preview={theme.id}
              aria-pressed={state.settings.theme === theme.id}
              className={state.settings.theme === theme.id ? 'active' : ''}
              onClick={() => patch({ theme: theme.id })}
            >
              <span className="theme-swatch" aria-hidden="true" />
              <span className="theme-label">{theme.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Account</h2>
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
        <p className="hint">Used to find your rating on the leaderboard.</p>
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
            : 'Click tavern tiers 1–7 in the pool to peek other tiers.'}
        </p>
      </section>

      <section className="card">
        <h2>Rating</h2>
        <p className={state.status.ratingOcr.failed ? 'status-wait' : 'status-ok'}>
          {ratingOcrLabel(state.status.ratingOcr)}
        </p>
        <p className="hint">
          Your rating is read from the Battlegrounds Play screen. If it looks wrong or stale, open
          that screen and read it again.
        </p>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="ghost" type="button" onClick={() => void window.battleBuddy.refreshRating()}>
            Read rating now
          </button>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Reading it from the game directly would be more reliable than reading the screen. This
          check reports how far BattleBuddy gets toward that on your machine.
        </p>
        <div className="row" style={{ marginTop: 4 }}>
          <button
            className="ghost"
            type="button"
            aria-busy={probing}
            onClick={async () => {
              if (probing) return
              setProbing(true)
              try {
                setProbe(await window.battleBuddy.probeRatingMemory())
              } finally {
                setProbing(false)
              }
            }}
          >
            {probing ? 'Checking\u2026' : 'Check direct rating access'}
          </button>
        </div>
        <div role="status">
          {probe ? (
            <>
              <p className={probe.failure ? 'status-wait' : 'status-ok'}>{describeProbe(probe)}</p>
              {probe.diagnostics.length ? (
                <ol className="games">
                  {probe.diagnostics.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              ) : null}
              <p className="hint">
                Details saved to rating-memory-probe.json in the app data folder.
              </p>
            </>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2>Today</h2>
        <p>
          {today.length} game{today.length !== 1 ? 's' : ''}
          {avg != null ? ` \u00b7 avg place ${avg}` : ''}
          {state.session.startMmr != null ? ` \u00b7 start ${formatMmr(state.session.startMmr)}` : ''}
        </p>
        {today.length ? (
          <ol className="games">
            {today
              .slice()
              .reverse()
              .map((game, i) => (
                <li key={`${game.endedAt}-${i}`}>
                  <span className={placeClass(game.placement)}>{ordinal(game.placement)}</span>
                  {game.heroName ? <span> \u00b7 {game.heroName}</span> : null}
                  <span> \u00b7 turn {game.turn}</span>
                  {game.mmrDelta != null ? <span> \u00b7 {formatDelta(game.mmrDelta)}</span> : null}
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

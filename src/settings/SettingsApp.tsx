import { useEffect, useState } from 'react'
import { DEFAULT_OVERLAY_LAYOUT, type AppSettings, type OverlaySnapshot } from '../core/types'
import { formatDelta, formatMmr, ordinal, placeClass } from '../ui/format'
import { gamesToday } from '../core/session'
import { UpdateBanner } from '../ui/UpdateBanner'

export function SettingsApp() {
  const [state, setState] = useState<OverlaySnapshot | null>(null)

  useEffect(() => {
    void window.battleBuddy.getState().then(setState)
    return window.battleBuddy.onState(setState)
  }, [])

  if (!state) {
    return (
      <div className="settings-root">
        <header className="settings-hero">
          <p className="eyebrow">BattleBuddy</p>
          <h1>Starting…</h1>
        </header>
      </div>
    )
  }

  const patch = (next: Partial<AppSettings>) => {
    void window.battleBuddy.setSettings(next)
  }

  const statusClass = state.status.hearthstoneFound
    ? state.status.logsLive
      ? 'status-ok'
      : 'status-wait'
    : 'status-wait'
  const today = gamesToday(state.session)
  const avg = today.length
    ? Math.round((today.reduce((a, g) => a + g.placement, 0) / today.length) * 10) / 10
    : null
  const checking = state.update.phase === 'checking'
  const latest = state.update.phase === 'unavailable'

  return (
    <div className="settings-root">
      <UpdateBanner update={state.update} />

      <header className="settings-hero">
        <div>
          <p className="eyebrow">Battlegrounds overlay</p>
          <h1>BattleBuddy</h1>
          <p className="lede">Launch anytime. The overlay follows the Hearthstone window — windowed, borderless, or fullscreen. Minion list on the right, combat odds on top.</p>
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
          {state.status.needsHearthstoneRestart ? ' · restart Hearthstone once' : ''}
        </p>
        <p className="hint">
          Cards: {state.status.cardCount} · Leaderboard: {state.status.leaderboardCount} players cached
        </p>
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
            : latest
              ? `You're on v${state.update.currentVersion}.`
              : `Installed version v${state.update.currentVersion}.`}
          {state.update.canInstall
            ? ' Installed copies check the rolling test release as well as numbered tags.'
            : ''}
        </p>
        <p className="hint">
          Windows may warn once (SmartScreen) until a code-signing certificate is added to CI as
          CSC_LINK. Choose More info → Run anyway.
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
          <span>Fix exclusive fullscreen only (leave windowed / borderless alone)</span>
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
            ? 'Hearthstone is in exclusive fullscreen. BattleBuddy is switching that mode so the HUD can draw on top — windowed and borderless are left as-is.'
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
          onChange={(e) => patch({ overlayOpacity: Number(e.target.value) || 96 })}
        />
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
          value={state.settings.battleTag}
          placeholder="JimJamHey"
          onChange={(e) => patch({ battleTag: e.target.value })}
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
          Combat odds on top. Unique card scripts that the text parser cannot read show as **Partial** on the combat bar.
          Hands and trinkets are included in the sim when Power.log prints them.
          Click tavern 1–7 to peek a tier; remaining shop copies update as minions are bought.
        </p>
      </section>

      <section className="card">
        <h2>Today</h2>
        <p>
          {today.length} games
          {avg != null ? ` · avg ${avg}` : ''}
          {state.session.startMmr != null ? ` · start ${formatMmr(state.session.startMmr)}` : ''}
        </p>
        <ol className="games">
          {today
            .slice()
            .reverse()
            .map((game, i) => (
              <li key={`${game.endedAt}-${i}`}>
                <span className={placeClass(game.placement)}>{ordinal(game.placement)}</span>
                {game.heroName ? <span> · {game.heroName}</span> : null}
                <span> · turn {game.turn}</span>
                {game.mmrDelta != null ? (
                  <span> · {formatDelta(game.mmrDelta)}</span>
                ) : null}
              </li>
            ))}
        </ol>
      </section>
    </div>
  )
}

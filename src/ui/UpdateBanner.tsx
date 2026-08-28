import type { UpdateState } from '../core/types'
import { shouldShowUpdate } from './format'

interface Props {
  update: UpdateState
  compact?: boolean
  onPointer?: (inside: boolean) => void
}

export function UpdateBanner({ update, compact, onPointer }: Props) {
  if (!shouldShowUpdate(update)) return null

  const version = update.availableVersion ? `v${update.availableVersion}` : 'a new build'
  const title =
    update.phase === 'ready'
      ? `Update ${version} is ready`
      : update.phase === 'downloading'
        ? `Downloading ${version}`
        : update.phase === 'error'
          ? update.canInstall
            ? 'Update failed'
            : `Update ${version} is on GitHub`
          : `Update ${version} is available`

  const detail =
    update.phase === 'ready'
      ? 'Restart BattleBuddy to finish installing.'
      : update.phase === 'downloading'
        ? `${update.progress}%`
        : update.phase === 'error'
          ? update.canInstall
            ? 'Try again, or grab the installer from GitHub.'
            : 'Installed copies update automatically. Open GitHub to get the latest.'
          : update.canInstall
            ? 'Download now, or later from this window.'
            : 'Friends on the installer get this automatically. Open GitHub to install it here.'

  const primary =
    update.phase === 'ready'
      ? { label: 'Restart', action: () => void window.battleBuddy.installUpdate() }
      : update.phase === 'downloading'
        ? null
        : update.canInstall && update.phase !== 'error'
          ? { label: 'Download', action: () => void window.battleBuddy.downloadUpdate() }
          : { label: 'Open GitHub', action: () => void window.battleBuddy.openRelease() }

  return (
    <div
      className={`update-banner ${compact ? 'compact' : ''} interactive capture-mouse`}
      onMouseEnter={() => onPointer?.(true)}
      onMouseLeave={() => onPointer?.(false)}
    >
      <div className="update-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {update.phase === 'downloading' ? (
        <div className="update-progress" aria-hidden>
          <i style={{ width: `${Math.max(update.progress, 6)}%` }} />
        </div>
      ) : null}
      <div className="update-actions">
        {primary ? (
          <button className="primary" type="button" onClick={primary.action}>
            {primary.label}
          </button>
        ) : null}
        {update.phase !== 'downloading' ? (
          <button className="ghost" type="button" onClick={() => void window.battleBuddy.dismissUpdate()}>
            Later
          </button>
        ) : null}
      </div>
    </div>
  )
}

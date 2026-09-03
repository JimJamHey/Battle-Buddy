import type { CaptureRect } from './playRating'

/**
 * Opponent minion row on the Battlegrounds combat board (16:9).
 * Sits below their hero and above the clash, where divine shield / reborn / gems are drawn.
 */
export function opponentCombatCaptureRect(client: CaptureRect): CaptureRect {
  return {
    x: client.x + Math.round(client.width * 0.06),
    y: client.y + Math.round(client.height * 0.14),
    width: Math.max(240, Math.round(client.width * 0.88)),
    height: Math.max(140, Math.round(client.height * 0.3))
  }
}

/** Friendly hand strip during combat. Scales with client aspect ratio (ref 16:9). */
export function friendlyHandCaptureRect(client: CaptureRect): CaptureRect {
  const refAspect = 16 / 9
  const aspect = client.width / Math.max(1, client.height)
  const yScale = Math.min(1.15, Math.max(0.85, aspect / refAspect))
  const yBase = 0.7 * yScale
  const hBase = 0.16 * yScale
  return {
    x: client.x + Math.round(client.width * 0.16),
    y: client.y + Math.round(client.height * yBase),
    width: Math.max(220, Math.round(client.width * 0.68)),
    height: Math.max(72, Math.round(client.height * hBase))
  }
}

/** Opponent hand strip during combat (mirrors friendly at the top). */
export function opponentHandCaptureRect(client: CaptureRect): CaptureRect {
  const refAspect = 16 / 9
  const aspect = client.width / Math.max(1, client.height)
  const yScale = Math.min(1.15, Math.max(0.85, aspect / refAspect))
  const yBase = 0.12 * yScale
  const hBase = 0.16 * yScale
  return {
    x: client.x + Math.round(client.width * 0.16),
    y: client.y + Math.round(client.height * yBase),
    width: Math.max(220, Math.round(client.width * 0.68)),
    height: Math.max(72, Math.round(client.height * hBase))
  }
}

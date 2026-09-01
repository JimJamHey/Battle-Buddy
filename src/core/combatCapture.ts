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

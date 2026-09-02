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

/** Friendly hand strip during combat (16:9). Used when Power.log omits HAND entities. */
export function friendlyHandCaptureRect(client: CaptureRect): CaptureRect {
  return {
    x: client.x + Math.round(client.width * 0.16),
    y: client.y + Math.round(client.height * 0.7),
    width: Math.max(220, Math.round(client.width * 0.68)),
    height: Math.max(72, Math.round(client.height * 0.16))
  }
}

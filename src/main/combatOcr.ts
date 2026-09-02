import { friendlyHandCaptureRect } from '../core/combatCapture'
import { matchCatalogCardsFromText } from '../core/combatHand'
import type { CombatMinion } from '../core/combatSim'
import type { CaptureRect } from '../core/playRating'
import type { BgMinion } from '../core/types'
import { ocrCaptureText } from './playRatingOcr'

export async function readCombatHandsFromScreen(
  client: CaptureRect,
  catalog: BgMinion[]
): Promise<{ friendly: CombatMinion[]; opponent: CombatMinion[] }> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return { friendly: [], opponent: [] }
  }
  const text = await ocrCaptureText(friendlyHandCaptureRect(client))
  return {
    friendly: matchCatalogCardsFromText(text, catalog),
    opponent: []
  }
}

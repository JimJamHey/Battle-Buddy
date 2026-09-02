import { friendlyHandCaptureRect, opponentHandCaptureRect } from '../core/combatCapture'
import { matchCatalogCardsFromText, type HandOcrRead } from '../core/combatHand'
import type { CombatMinion } from '../core/combatSim'
import type { CaptureRect } from '../core/playRating'
import type { BgMinion } from '../core/types'
import { ocrCaptureText } from './playRatingOcr'

export type CombatHandOcrResult = {
  friendly: CombatMinion[]
  opponent: CombatMinion[]
  statsUncertain: { friendly: boolean; opponent: boolean }
}

function toMinions(read: HandOcrRead): CombatMinion[] {
  return read.minions.map(({ statsFromOcr: _statsFromOcr, ...minion }) => minion)
}

export async function readCombatHandsFromScreen(
  client: CaptureRect,
  catalog: BgMinion[]
): Promise<CombatHandOcrResult> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return {
      friendly: [],
      opponent: [],
      statsUncertain: { friendly: false, opponent: false }
    }
  }
  const [friendlyText, opponentText] = await Promise.all([
    ocrCaptureText(friendlyHandCaptureRect(client)),
    ocrCaptureText(opponentHandCaptureRect(client))
  ])
  const friendly = matchCatalogCardsFromText(friendlyText, catalog)
  const opponent = matchCatalogCardsFromText(opponentText, catalog)
  return {
    friendly: toMinions(friendly),
    opponent: toMinions(opponent),
    statsUncertain: {
      friendly: friendly.statsUncertain,
      opponent: opponent.statsUncertain
    }
  }
}

/** Test helper: parse OCR text without screen capture. */
export function readCombatHandsFromText(
  friendlyText: string,
  opponentText: string,
  catalog: BgMinion[]
): CombatHandOcrResult {
  const friendly = matchCatalogCardsFromText(friendlyText, catalog)
  const opponent = matchCatalogCardsFromText(opponentText, catalog)
  return {
    friendly: toMinions(friendly),
    opponent: toMinions(opponent),
    statsUncertain: {
      friendly: friendly.statsUncertain,
      opponent: opponent.statsUncertain
    }
  }
}

/**
 * Card-id combat kits. Overlay these on `parseCardCombat` when a card is wrong
 * in-game: unique scripts, golden extras, or text the parser cannot read.
 *
 * How to add a kit
 * 1. Play a fight and note the card id (golden ids end in `_G`).
 * 2. Add an entry below. Exact id wins, then `poolBaseId` (strips `_G` / skins).
 * 3. Use a `Partial<CombatKit>` to patch fields, or a function when golden /
 *    stats matter. Triggers with the same `when` (and avenge count) replace the
 *    parsed row; new triggers are appended.
 * 4. Re-run the fight — odds pick up the kit without changing the sim loop.
 *
 * Keep this file small. Prefer the text parser for ordinary DR / SoC / Rally.
 * Frenzy, Magnetic, Spellcraft, and "this game" effects stay Partial until a
 * kit (or new op) actually models them.
 */
import type { CombatKit, CombatTriggerSet } from './combatEffects'
import { parseCardCombat } from './combatEffects'

/** Same as `poolBaseId` — kept local so this module does not import `cards`. */
function kitBaseId(cardId: string): string {
  return cardId.replace(/_SKIN_[A-Z0-9]+$/i, '').replace(/_G$/i, '')
}

export type KitCard = {
  id: string
  name?: string
  text?: string
  golden?: boolean
}

export type KitEntry = Partial<CombatKit> | ((card: KitCard) => Partial<CombatKit>)

export const COMBAT_KITS: Record<string, KitEntry> = {
  // Titus / Baron-like: deathrattles trigger extra times. Golden text often
  // says "two extra times", which the parser used to miss.
  BG25_354: { extraDeathrattles: 1 },
  BG25_354_G: { extraDeathrattles: 2 },
  // Tavern spell / combat SoC the text parser cannot express (set health).
  BG28_573: {
    triggers: [
      { when: 'startOfCombat', effects: [{ op: 'setHealth', health: 1, target: 'randomEnemy' }] }
    ]
  },
  // Diremuck Forager — highest-Attack Murloc from hand at start of combat.
  BG27_556: {
    triggers: [
      {
        when: 'startOfCombat',
        effects: [{ op: 'summonFromHand', count: 1, tribe: 'Murloc', select: 'highestAttack' }]
      }
    ]
  },
  BG27_556_G: {
    triggers: [
      {
        when: 'startOfCombat',
        effects: [{ op: 'summonFromHand', count: 1, tribe: 'Murloc', select: 'highestAttack' }]
      }
    ]
  },
  // Piloted Whirl-O-Tron — SoC: copy the two leftmost deathrattles from the friendly board.
  // Text: "Start of Combat: Copy your two left-most Deathrattles (except other Whirl-O-Trons)."
  BG21_HERO_030_Buddy: {
    triggers: [
      { when: 'startOfCombat', effects: [{ op: 'copyLeftDeathrattles', count: 2 }] }
    ]
  },
  BG21_HERO_030_Buddy_G: {
    triggers: [
      { when: 'startOfCombat', effects: [{ op: 'copyLeftDeathrattles', count: 4 }] }
    ]
  },
  // Elementium Squirrel Bomb — DR: deal 4 damage per own Mech that died this combat.
  // Text: "Deathrattle: Deal 4 damage to a random enemy minion for each of your Mechs that died this combat."
  // 'damageDead' op scales by deaths at runtime; tribe='Mech' filters to Mechs only.
  TB_BaconShop_HERO_17_Buddy: {
    triggers: [
      { when: 'deathrattle', effects: [{ op: 'damageDead', attack: 4, tribe: 'Mech' }] }
    ]
  },
  TB_BaconShop_HERO_17_Buddy_G: {
    triggers: [
      { when: 'deathrattle', effects: [{ op: 'damageDead', attack: 8, tribe: 'Mech' }] }
    ]
  },
  // Deflect-o-Bot — buff self when a Mech is summoned during combat.
  BGS_071: {
    triggers: [
      {
        when: 'onSummon',
        summonTribe: 'Mech',
        effects: [{ op: 'buff', target: 'self', attack: 2, keywords: ['divineShield'] }]
      }
    ]
  },
  BGS_071_G: {
    triggers: [
      {
        when: 'onSummon',
        summonTribe: 'Mech',
        effects: [{ op: 'buff', target: 'self', attack: 4, keywords: ['divineShield'] }]
      }
    ]
  }
}

export function kitLookupIds(cardId: string): string[] {
  if (!cardId) return []
  const ids = [cardId]
  const base = kitBaseId(cardId)
  if (base && base !== cardId) ids.push(base)
  return ids
}

export function mergeCombatKits(base: CombatKit, overlay: Partial<CombatKit>): CombatKit {
  const triggers = [...base.triggers]
  for (const row of overlay.triggers ?? []) {
    const i = triggers.findIndex((t) => sameTrigger(t, row))
    if (i >= 0) triggers[i] = row
    else triggers.push(row)
  }
  return {
    triggers,
    extraDeathrattles: overlay.extraDeathrattles ?? base.extraDeathrattles,
    cleave: overlay.cleave ?? base.cleave
  }
}

export function lookupCombatKit(cardId: string, text: string, card?: KitCard): CombatKit {
  const parsed = parseCardCombat(text)
  const entry = resolveKitEntry(cardId)
  if (!entry) return parsed
  const overlay = typeof entry === 'function' ? entry({ id: cardId, text, ...card }) : entry
  return mergeCombatKits(parsed, overlay)
}

export function kitCoversGap(kit: CombatKit, gap: string): boolean {
  if (gap === 'Deathrattle') return kit.triggers.some((row) => row.when === 'deathrattle')
  if (gap === 'Rally') return kit.triggers.some((row) => row.when === 'rally')
  if (gap === 'Start of Combat') return kit.triggers.some((row) => row.when === 'startOfCombat')
  if (gap === 'Avenge') return kit.triggers.some((row) => row.when === 'avenge')
  if (gap === 'On Summon') return kit.triggers.some((row) => row.when === 'onSummon')
  if (gap === 'Copy Deathrattle') {
    return kit.triggers.some((row) =>
      row.effects.some((fx) => fx.op === 'copyLeftDeathrattles')
    )
  }
  return false
}

function resolveKitEntry(cardId: string): KitEntry | undefined {
  for (const id of kitLookupIds(cardId)) {
    const hit = COMBAT_KITS[id]
    if (hit) return hit
  }
  return undefined
}

function sameTrigger(a: CombatTriggerSet, b: CombatTriggerSet): boolean {
  return (
    a.when === b.when &&
    (a.avenge ?? null) === (b.avenge ?? null) &&
    (a.summonTribe ?? null) === (b.summonTribe ?? null)
  )
}

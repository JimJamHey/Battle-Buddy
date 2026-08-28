export function isBgHeroCardId(id: string): boolean {
  if (!id) return false
  if (/Bob$|BaconShopBob|_Buddy|_PH$/i.test(id)) return false
  return /^(?:TB_BaconShop_HERO_|BG\d+_HERO_|BGDUO_HERO_)/i.test(id)
}

/** Bob / Kel'Thuzad on the board at hero select — not a picked hero. */
export function isBaconBobHero(id: string): boolean {
  return /KelThuzad|_HERO_Kel|_HERO_PH/i.test(id)
}

export function isPickedBgHero(id: string): boolean {
  return isBgHeroCardId(id) && !isBaconBobHero(id)
}

const BOB_HERO_NAMES = new Set([
  'bob',
  "bob's tavern",
  'lady deathwhisper',
  "kel'thuzad",
  'kelthuzad'
])

/** True for tavern/hero labels like "Lady Vashj" — not BattleTags. */
export function looksLikeHeroName(name: string): boolean {
  const stripped = name.replace(/#\d+$/, '').trim()
  if (!stripped) return false
  const n = stripped.toLowerCase()
  if (BOB_HERO_NAMES.has(n)) return true
  if (/^(lady|lord|captain|king|queen|prince|princess|sir|doctor)$/i.test(stripped)) return true
  return /\s/.test(stripped) || /,/.test(stripped)
}

/** Power.log BACON_SUBSET_* tags (name and numeric GameTag) → display tribe. */
export const TRIBE_SUBSET_TAGS: Record<string, string> = {
  BACON_SUBSET_DRAGON: 'Dragon',
  '1591': 'Dragon',
  BACON_SUBSET_MURLOC: 'Murloc',
  '1592': 'Murloc',
  BACON_SUBSET_DEMON: 'Demon',
  '1593': 'Demon',
  BACON_SUBSET_BEAST: 'Beast',
  '1594': 'Beast',
  BACON_SUBSET_MECH: 'Mech',
  BACON_SUBSET_MECHANICAL: 'Mech',
  '1595': 'Mech',
  BACON_SUBSET_PIRATE: 'Pirate',
  '1596': 'Pirate',
  BACON_SUBSET_ELEMENTALS: 'Elemental',
  BACON_SUBSET_ELEMENTAL: 'Elemental',
  '1688': 'Elemental',
  BACON_SUBSET_QUILLBOAR: 'Quilboar',
  BACON_SUBSET_QUILBOAR: 'Quilboar',
  '1845': 'Quilboar',
  BACON_SUBSET_NAGA: 'Naga',
  '2272': 'Naga',
  BACON_SUBSET_UNDEAD: 'Undead',
  '2347': 'Undead',
  BACON_SUBSET_TOTEM: 'Totem',
  '2630': 'Totem',
  BACON_BUDDY_ENABLED: 'Buddy',
  '2518': 'Buddy',
  BACON_BUDDY: 'Buddy',
  '2154': 'Buddy'
}

export const TRIBE_ORDER = [
  'Beast',
  'Demon',
  'Dragon',
  'Elemental',
  'Mech',
  'Murloc',
  'Naga',
  'Pirate',
  'Quilboar',
  'Undead',
  'Totem'
]

const TRIBE_ALIASES: Record<string, string> = {
  beast: 'Beast',
  demon: 'Demon',
  dragon: 'Dragon',
  elemental: 'Elemental',
  elementals: 'Elemental',
  mech: 'Mech',
  mechanical: 'Mech',
  murloc: 'Murloc',
  naga: 'Naga',
  pirate: 'Pirate',
  quilboar: 'Quilboar',
  quillboar: 'Quilboar',
  undead: 'Undead',
  totem: 'Totem'
}

/** HSJSON uses BEAST / MECHANICAL; the overlay groups by Beast / Mech. All-type minions are Neutral. */
export function canonicalTribe(raw: string): string | null {
  const key = raw.trim().toLowerCase()
  if (!key || key === 'all') return null
  return TRIBE_ALIASES[key] ?? `${raw.charAt(0).toUpperCase()}${raw.slice(1).toLowerCase()}`
}

export function tribeSlug(tribe: string): string {
  return tribe.toLowerCase().replace(/[^a-z]/g, '')
}

export function sortTribes(tribes: string[]): string[] {
  return [...new Set(tribes)].sort((a, b) => {
    const ia = TRIBE_ORDER.indexOf(a)
    const ib = TRIBE_ORDER.indexOf(b)
    const sa = ia < 0 ? 99 : ia
    const sb = ib < 0 ? 99 : ib
    if (sa !== sb) return sa - sb
    return a.localeCompare(b)
  })
}

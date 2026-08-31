# Strategy curation (not in the overlay yet)

BattleBuddy’s tester overlay does **not** show composition guides. This file is the process for keeping mid-skill comps current with the live Battlegrounds pool after each patch.

## Why not Hearthstone Deck Tracker / JeefHS

HDT’s in-game comps are a curated copy of JeefHS’s high-ladder lines. Two problems:

1. **They lag patches.** When Blizzard rotates the tavern or hotfixes a card, the overlay still shows last week’s cores until someone rewrites the list.
2. **They are the wrong skill band.** Jeef’s commit timing, triples, and hero-specific lines assume a much higher level than this project’s testers.

We do not scrape or vendor those guides. Comps here are generated from the **same live catalog the overlay already uses** (`api.hearthstonejson.com/v1/latest`), then reviewed by a human who actually plays at this MMR.

## Sources of truth

| What | Where |
|---|---|
| Live minion / spell / buddy pool | HearthstoneJSON `cards.json` (`isBattlegroundsPoolMinion` / spells / buddies) — same fetch as the overlay |
| Patch identity | Highest numbered folder on `https://api.hearthstonejson.com/v1/` (the `/v1/latest/` URL no longer redirects) |
| Generated directions | `data/strategy-candidates.json` (tribe + payoff mechanic clusters) |
| Human-approved comps | `data/strategies/curated.json` |
| Last patch delta | `data/pool-diff.json` |

Optional later: [hsbg.cards patch history](https://hsbg.cards/api-docs) if HSJSON is slow after a hotfix. Do not use hsbgguide.com / Jeef sheets as the default.

## After every Battlegrounds patch

```bash
npm run curate
```

That script:

1. Downloads `cards.json` and records the HSJSON build.
2. Writes `data/pool-snapshot.json` (pool only — not the full dump).
3. Diffs against the previous snapshot (`+` / `-` / text-stat changes).
4. Rebuilds candidate comps from tribe + mechanic clusters (Deathrattle, Battlecry, Rally, Avenge, Magnetic, Spellcraft, End of Turn, Start of Combat, Reborn, Divine Shield).
5. Re-checks `curated.json` and flags any core card that left the pool.

Then, in a short review (not a Jeef rewrite):

- Open `data/pool-diff.json`. Anything you already play that was **removed** or **nerfed** is stale — delete or rewrite it in `curated.json`.
- Open `data/strategy-candidates.json`. Promote a cluster only if you would actually commit to it in a normal lobby: copy `id` / `tribes` / core card ids into `curated.json` and add a one-line `commitWhen` in your own words (turn band, not a 10k-MMR sequence).
- Skip clusters that are “the mechanic exists” but have no obvious midgame payoff. The generator is a net, not a tier list.
- Commit the updated snapshot + curated file so the next patch diffs against reality.

Candidates are **not** overlay UI. They are the inbox for curation.

## Comp shape

```json
{
  "id": "mech-magnetic",
  "name": "Mech Magnetic",
  "tribes": ["Mech"],
  "mechanic": "Magnetic",
  "coreIds": ["BG_CARD_A", "BG_CARD_B"],
  "supportIds": ["BG_CARD_C"],
  "commitWhen": "When you hit tavern 4 with two Magnetics in hand or shop",
  "notes": "Playable without perfect triples"
}
```

`coreIds` must stay in the current snapshot or `npm run curate` will mark the comp `stale`. That is how we avoid HDT’s silent out-of-date list.

## What this is not

- Not hero-tier lists, trinket/quest overlays, or combat sim work.
- Not an in-game suggestion panel for the test group (that comes after testers have a downloadable build).
- Not a substitute for playing the patch — the human pass is required.

## Later (overlay)

The overlay already shows live-pool comps for this lobby’s tribes (`overlayStrategies`). Curated entries in `curated.json` win over generated candidates; stale cores are hidden. Keep running `npm run curate` after patches so the snapshot and candidates stay honest.

# BattleBuddy re-audit — 30 Aug 2026

Fresh-eyes pass after the P0–P2 fix set. Three reviewers looked at core, overlay, and Electron independently. **131 tests passing.**

## Verdict

No remaining **P0** (wrong in a live match with high confidence). The original P0s are closed. A second pass found leftover **P1s**; those are now fixed in this same change. What is left is accepted combat-parser honesty, platform limitations, and lower-severity cleanup.

## Original P0–P2 — closed

| Sev | Issue | Status |
|-----|--------|--------|
| P0 | Pool remaining released on HAND→PLAY / combat end / deaths | **Fixed.** Hold HAND; hold PLAY in combat; stay held through PLAY/GRAVEYARD; shop PLAY (Bob) not taken; release only on minion sell. |
| P0 | Warband CSS vs JSX (`warband-portrait` vs `face/gem/shell/rim`) | **Fixed.** CSS matches JSX. |
| P0 | Combat bar both flanks labeled LETHAL | **Fixed.** Left LETHAL, right DEATH. |
| P1 | `mergeBuffs` summed two readings of one buff | **Fixed.** Last write wins. |
| P1 | Freeze combat vs self | **Fixed.** Abort if opponent === self. |
| P1 | Friendly seat guessed from lobby order | **Fixed.** No multi-player guess; sole `Name#1234` only if BattleTag empty. |
| P1 | Combat phase-off from GameState `value=0` | **Fixed.** PowerTaskList-only. |
| P1 | Three Power.log parsers | **Fixed.** Shared `src/core/powerLog.ts`. |
| P1 | OverlayApp / main god files | **Reduced.** CombatBar, SessionRail, SeenBoard, useClickThrough extracted. |
| P1 | Log tailer overlapping polls; attachLogs wiping parser | **Fixed.** Poll mutex; keep parser if match is live; attach serialized. |
| P1 | Power.log “live” using LoadingScreen mtime | **Fixed.** `lastPowerWrite` from Power.log only; `startFromEnd` seeds mtime. |
| P1 | Exclusive fullscreen Alt+Enter | **Removed.** Banner asks testers to switch; no display-mode hijack. |
| P1 | 16ms overlay loop | **Fixed.** 100ms Windows / 250ms macOS. |
| P1 | Test channel offered to stable | **Fixed.** `allowPrerelease` only when current version is prerelease. |
| P1 | Empty curated comps before tribes | **Fixed.** No comps until lobby tribes exist; wait until `tribesComplete`. |
| P2 | Dead CSS, atomic persist, settings clamp, combat parse cache, pool grouping, OCR temps, click-through owner | **Fixed.** |

## Fresh-eyes P1s found and fixed this pass

| Issue | Fix |
|--------|-----|
| Cast tavern spells returned a pool copy (`SETASIDE` looked like a sell) | Spells stay consumed after cast. |
| `Partial` missed mechanic-only Deathrattle / live `deathrattle` flag with no kit | `combatParseGaps` + `combatInputHasGaps` now flag those. |
| Session `matchKey` merge kept the earlier (wrong) placement | Merge prefers the later `endedAt` row. |
| LoadingScreen catchup could emit a stale `hub` line and wipe a restored match | Ignore loading-scene side effects during catchup. |
| Combat bar said “Waiting for combat” while pool said Combat N | In-combat without a freeze shows “Calculating combat…”. |
| Comps treated a partial tribe list as final | Overlay waits on `tribesComplete`. |
| Newest session folder ignored until `Power.log` existed | Prefer newest session dir even before the file appears. |
| Tailer `stop()` raced an in-flight poll; `attachLogs` was not serialized | Async drain + single-flight chain. |
| Settings copy claimed exclusive fullscreen worked | Copy matches overlay (windowed / borderless). |
| Catalog errors hidden in settings | `cardsError` shown in status. |

## Remaining — accepted or lower severity

### Combat sim (honesty layer, not a silent lie)

The text parser cannot cover unique scripts, Frenzy, Magnetic, Spellcraft, Activate, End of Turn, hero powers, or magnetic stacking. Those boards show **Partial**. Do not treat Partial odds as complete.

### Platform / product

| Item | Notes |
|------|--------|
| Exclusive fullscreen | Overlay cannot sit on D3D exclusive. We do not send Alt+Enter. Opt-in setting may rewrite `options.txt` for the **next** HS launch. |
| macOS unsigned / `identity: null` | Gatekeeper + updater need Developer ID + notarization. Documented. |
| Private-repo auto-update | Needs a public repo or a token. Documented. |
| Windows OCR only | Mac uses the public leaderboard. |
| Mid-match attach | Pool counts start at full until buys/deaths are seen. |
| Triple parse per line | parser + BoardTracker + PoolTracker still each walk Power.log. Shared helpers, not a single event bus. |
| Log truncation mid-tail | Rare HS log rotate can replay lines. Not handled as a full recatchup. |
| macOS 28px title-bar inset | Hardcoded; overlay can drift on unusual chrome. |
| OCR PrintWindow fallback | Screen BitBlt can include overlay pixels if PrintWindow fails. |
| `showLobbyOnOverlay` | Forced off. Lobby UI CSS is gone. |

### P3 polish still open

- Venomous warband class has no distinct visual.
- Golden card-preview glow CSS is unused.
- Drag handle is focusable without keyboard move.
- Panel clamp is 88% origin, not “stay fully on screen.”
- `matchKey` is time-of-day only (mitigated by `endedAt` date filter).

## How to watch progress

The Cursor goal/todo canvas for this workstream is the live checklist (P0 pool / warband / lethal, P1 core / overlay / Electron, P2 structure / perf, extras, re-audit). This file is the written snapshot after the re-audit.

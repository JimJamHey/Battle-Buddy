# BattleBuddy

Battlegrounds-only overlay for Hearthstone on **Windows** and **macOS**. Not a deck tracker — no constructed, arena, or mercenaries.

## Download (testers)

Install from the **[test release](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test)** (repo access required while private).

| File | Install |
|---|---|
| `BattleBuddy-Setup.exe` | Double-click. SmartScreen → **More info** → **Run anyway** once if prompted. Auto-updates on the test channel. |
| `BattleBuddy-windows.zip` | Unzip, run `BattleBuddy.exe` |
| `BattleBuddy.dmg` | Drag to Applications. First open: right-click → **Open** if Gatekeeper blocks |

Start BattleBuddy, then Hearthstone.

## Features

- **Combat odds** — lethal vs death once a fight starts; parses boards, keywords, deathrattles, hands, and trinkets from `Power.log`
- **Minion pool** — live HearthstoneJSON catalog by tavern tier with card art
- **Comps** — curated strategy lines for this lobby’s tribes (see overlay session rail)
- **Session** — start/current MMR, games today, average place, recent boards
- **Updates** — installed copies check the rolling `test` release on launch

Lobby MMR uses Blizzard’s public leaderboard (region in settings). Unlisted players show `8000↓`. BattleTag is read from `Power.log`.

### Hotkeys

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+Shift+B | Toggle overlay |
| Ctrl/Cmd+Shift+1–7 | Peek tavern tier |
| Ctrl/Cmd+Shift+0 | All tiers |
| Ctrl/Cmd+Shift+C | Click-through off for 5s (pool) |
| Ctrl/Cmd+Shift+L | Unlock layout — drag panels |

## Data sources

- Cards: [HearthstoneJSON](https://api.hearthstonejson.com/v1/latest/enUS/cards.json) (cached locally)
- Live match: Hearthstone `Power.log`, `LoadingScreen.log`, `GameNetLogger.log`
- MMR: Blizzard leaderboard API + post-game OCR (Windows/macOS)

No process memory reads.

## Develop

**Requirements:** Node 20+, Hearthstone with file logging enabled.

```bash
npm install
npm run dev
```

```bash
npm test
npm run dist:win   # Windows
npm run dist:mac   # macOS
```

CI publishes the `test` prerelease on every `master` push (`0.1.0-test.<run>`). Tag `v0.1.x` in `package.json` for numbered releases.

### Strategy curation

After a Battlegrounds patch:

```bash
npm run curate
```

See [docs/strategy-curation.md](docs/strategy-curation.md). Curated comps live in `data/strategies/curated.json`. Visual review: open `docs/strategy-preview.html` in a browser.

### Code signing (optional)

Unsigned builds are fine for a small test group. To remove SmartScreen/Gatekeeper warnings later, add signing secrets in GitHub Actions — see [docs/signing.md](docs/signing.md).

## Notes

- Public leaderboards top out around 8000 MMR
- Hearthstone Deck Tracker can run alongside; you’ll see two overlays

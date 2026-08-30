# BattleBuddy

Battlegrounds-only overlay for Hearthstone on **Windows** and **macOS**. It is not a deck tracker. There is no constructed, arena, or mercenaries mode.

## Download (test group)

Testers should **not** install Node or run from source. Grab a Windows build from GitHub:

**[Latest test build](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test)**

| File | What to do |
|---|---|
| `BattleBuddy-Setup.exe` | Double-click to install. Fast on disk; later updates can use the in-app banner. |
| `BattleBuddy-windows.zip` | Unzip and run `BattleBuddy.exe`. Same fast app, no installer, no auto-update. |

Stable links once the first test release exists:

- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy-Setup.exe
- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy-windows.zip

Windows SmartScreen may say the app is unrecognized (the build is unsigned). Choose **More info → Run anyway**.

Start BattleBuddy, then Hearthstone (windowed or borderless is easiest). If a banner asks you to enable file logs, **restart Hearthstone once**. You can open BattleBuddy whether or not the game is already running; the overlay attaches when the window appears.

macOS testers: a `.dmg` is not part of the rolling Windows test drop yet. Run from source below, or wait for a tagged `v*` release built on a Mac.

If the test release is missing, a pull request’s **Actions → Release → windows** artifact is the same zip/installer (unzip the artifact, then run the Setup or the zip).

## What it shows

- Combat odds at the top of the overlay once a fight starts (boards from `Power.log`; tavern-tier damage; Taunt, Divine Shield, Poisonous, Venomous, Reborn, Windfury, Cleave, stealth, deathrattles, Avenge, Rally, and Start of Combat parsed from card text). Unique scripts, hands, and trinkets are still incomplete.
- Hero name and this lobby’s tribes once you pick (pool stays hidden during hero select so it doesn’t cover the portraits)
- Session: start/current public MMR, games today, average finish, latest places
- Update banner on launch when a newer GitHub Release exists
- Lobby public MMR: names from `Power.log`, ratings from Blizzard’s published Battlegrounds leaderboard (region in settings). Unlisted players show `8000↓`. Names the log never prints stay `Unknown`
- Minion pool by tavern tier (HearthstoneJSON), with tile art

There is **no in-game composition guide** in this drop. Strategy work is a separate curation pipeline — see [docs/strategy-curation.md](docs/strategy-curation.md).

Region is auto-detected from Battle.net (change it in settings if lobby MMR is wrong). Your BattleTag is read from `Power.log` when you enter a match.

### Hotkeys

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+Shift+B | Toggle overlay |
| Ctrl/Cmd+Shift+1–7 | Peek tavern tier |
| Ctrl/Cmd+Shift+0 | Auto tier (your current tech level) |
| Ctrl/Cmd+Shift+C | Allow clicks on the minion pool for 5 seconds |

## How it gets data

- **Cards:** `https://api.hearthstonejson.com/v1/latest/enUS/cards.json` (cached in app data)
- **Live match:** Hearthstone `Logs/Power.log` and `LoadingScreen.log`
- **MMR:** `https://hearthstone.blizzard.com/en-us/api/community/leaderboardsData` (cached; not live post-game rating from the client)

BattleBuddy does not read Hearthstone process memory.

## Requirements

- Hearthstone running (windowed, borderless, or fullscreen)
- Node.js 20+ only if you develop from source; testers using Setup.exe / the zip do not need Node

## Run from source

```bash
npm install
npm run dev
```

The control window opens immediately. Start (or already have) Hearthstone. The overlay should snap to the client area within a second.

If this machine has never enabled Hearthstone file logs, BattleBuddy writes `%LocalAppData%\Blizzard\Hearthstone\log.config` (Windows) or `~/Library/Preferences/Blizzard/Hearthstone/log.config` (macOS). **Restart Hearthstone once** when the banner asks. If Hearthstone Deck Tracker already enabled logs, live tracking works on the current session.

### macOS

Grant **Accessibility** if the overlay cannot follow the Hearthstone window (System Settings → Privacy & Security → Accessibility).

## Packaged builds

GitHub Actions builds Windows on every `master` push and publishes the [test](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test) prerelease. Tag `v0.1.1` (and bump `"version"` in `package.json`) for a numbered release that auto-update can see.

Locally (must match the OS — native `koffi` bindings):

```bash
npm run dist        # current OS
npm run dist:win    # NSIS installer + zip (run on Windows)
npm run dist:mac    # dmg + zip (run on a Mac)
```

Windows artifacts land in `release/`:

- `BattleBuddy-Setup.exe` — installer for testers
- `BattleBuddy-windows.zip` — unzip and run `BattleBuddy.exe`
- `win-unpacked/BattleBuddy.exe` — same app, unpacked

Node 20+ is recommended. The Windows build skips code signing so it does not need symlink privileges for `winCodeSign`.

### Auto-update (installed copies)

Friends install **once** from a GitHub Release. When you publish a newer **versioned** tag (`v0.1.1`, not the rolling `test` prerelease), BattleBuddy checks on launch and shows a small banner: **Download** (installed apps) or **Open GitHub** (dev / zip). After download they click **Restart**.

1. Create a GitHub personal access token with `repo` scope and set `GH_TOKEN` (only needed for local `publish:*`; Actions uses `GITHUB_TOKEN`).
2. Bump `"version"` in `package.json`.
3. Push tag `v0.1.1` — CI uploads the installer and `latest.yml`.

macOS auto-update works best with a signed/notarized build. Until you have an Apple Developer cert, friends on Mac can still use the banner’s GitHub link to download the new dmg.

## Strategy curation

After a Battlegrounds patch:

```bash
npm run curate
```

That refreshes `data/pool-snapshot.json` from HearthstoneJSON, writes candidate comps, and flags curated comps whose core cards left the pool. Full process: [docs/strategy-curation.md](docs/strategy-curation.md).

## Notes

- Public leaderboards cut off around 8000 MMR
- You can run Hearthstone Deck Tracker at the same time; you will see two overlays

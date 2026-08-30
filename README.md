# BattleBuddy

Battlegrounds-only overlay for Hearthstone on **Windows** and **macOS**. It is not a deck tracker. There is no constructed, arena, or mercenaries mode.

## Download (test group)

Testers should **not** install Node or run from source. Grab a build from GitHub:

**[Latest test build](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test)**

| File | What to do |
|---|---|
| `BattleBuddy-Setup.exe` | Double-click to install. Fast on disk; auto-update follows this test channel. |
| `BattleBuddy-windows.zip` | Unzip and run `BattleBuddy.exe`. Same fast app, no installer. |
| `BattleBuddy.dmg` | macOS: drag to Applications (unsigned until an Apple cert is added). |

Stable links once the first test release exists:

- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy-Setup.exe
- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy-windows.zip
- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy.dmg

Windows SmartScreen may still warn until a code-signing cert is set as GitHub secret `CSC_LINK`. Choose **More info → Run anyway**.

Start BattleBuddy, then Hearthstone (**windowed or borderless**). Exclusive fullscreen is detected and a banner asks you to switch — BattleBuddy will not send Alt+Enter or change the display mode. If a banner asks you to enable file logs, **restart Hearthstone once**. You can open BattleBuddy whether or not the game is already running; the overlay attaches when the window appears.

Private-repo testers cannot auto-update until the repo is public (or a GitHub token is configured). Grab a new artifact from Actions / Releases instead.

If the test release is missing, a pull request’s **Actions → Release** artifacts (`windows` / `macos`) are the same files.

## What it shows

- Combat odds at the top once a fight starts. Left is **Lethal** (you kill them); right is **Death** (you die). Boards, tavern-tier damage, keywords, deathrattles, Avenge, Rally, and Start of Combat come from card text. **Hands** and **trinkets** in Power.log are included. Unique scripts the text parser cannot read show as **Partial** on the combat bar (hover it).
- Live remaining shop copies on each minion row (bought minions leave the shared pool; sells return them; deaths and combat clones do not)
- Composition suggestions for this lobby’s tribes, generated from the live HearthstoneJSON pool (curated comps override candidates). The list waits until lobby types are known.
- Hero name and this lobby’s tribes once you pick
- Session: start/current public MMR, games today, average finish, latest places. Hover a game for the final board.
- Update banner on launch when a newer build on the **same channel** exists (`0.1.0-test.N` testers follow the rolling `test` release; a numbered `0.1.0` install is not offered a test build)
- Lobby public MMR: names from `Power.log`, ratings from Blizzard’s published Battlegrounds leaderboard (region in settings). Unlisted players show `8000↓`. Names the log never prints stay `Unknown`
- Minion pool by tavern tier (HearthstoneJSON), with tile art. **All** shows every tier; 1–7 peeks one tavern.

Region is auto-detected from Battle.net (change it in settings if lobby MMR is wrong). Your BattleTag is read from `Power.log` when you enter a match.

### Hotkeys

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+Shift+B | Toggle overlay |
| Ctrl/Cmd+Shift+1–7 | Peek tavern tier |
| Ctrl/Cmd+Shift+0 | All tavern tiers |
| Ctrl/Cmd+Shift+C | Allow clicks on the minion pool for 5 seconds |
| Ctrl/Cmd+Shift+L | Unlock overlay layout (drag panels) |

## How it gets data

- **Cards:** `https://api.hearthstonejson.com/v1/latest/enUS/cards.json` (cached in app data)
- **Live match:** Hearthstone `Logs/Power.log`, `LoadingScreen.log`, and `GameNetLogger.log`
- **MMR:** `https://hearthstone.blizzard.com/en-us/api/community/leaderboardsData` (cached). On **Windows**, post-game rating is also OCR’d from the Play/results screen. macOS uses the public leaderboard only.

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

GitHub Actions builds **Windows and macOS** on every `master` push and publishes the [test](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test) prerelease. Each test build bumps `0.1.0-test.<run>` so installed copies see a newer version. Tag `v0.1.1` (and bump `"version"` in `package.json`) for a numbered release.

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

To sign Windows builds, add GitHub secrets `CSC_LINK` (base64 PFX) and `CSC_KEY_PASSWORD`. Without those, the installer is unsigned and SmartScreen will warn.

### Auto-update (installed copies)

Friends install **once** from the test Setup.exe. Later `master` builds increment the prerelease version; BattleBuddy checks on launch (including prereleases) and shows **Download**, then **Restart**.

Numbered tags (`v0.1.1`) still work the same way. Zip/portable copies get a GitHub link instead of in-place install.

1. Optional local publish: `GH_TOKEN` with `repo` scope, then `npm run publish:win` / `publish:mac`.
2. CI already publishes the `test` prerelease on `master`.

macOS auto-update works best with a signed/notarized build. Until you have an Apple Developer cert, friends on Mac can use the banner’s GitHub link to download the new dmg.

## Strategy curation

After a Battlegrounds patch:

```bash
npm run curate
```

That refreshes `data/pool-snapshot.json` from HearthstoneJSON, writes candidate comps, and flags curated comps whose core cards left the pool. Full process: [docs/strategy-curation.md](docs/strategy-curation.md).

## Notes

- Public leaderboards cut off around 8000 MMR
- You can run Hearthstone Deck Tracker at the same time; you will see two overlays

# BattleBuddy

Battlegrounds-only overlay for Hearthstone on **Windows** and **macOS**. It is not a deck tracker. There is no constructed, arena, or mercenaries mode.

You can open BattleBuddy **whether or not Hearthstone is already running**. The overlay attaches when a game window appears. If you join mid-match, it catches up from the current `Power.log`.

## Requirements

- Hearthstone running (windowed, borderless, or fullscreen)
- Node.js 20+ to develop; a packaged build does not need Node

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

```bash
npm run dist        # current OS
npm run dist:win    # NSIS + portable
npm run dist:mac    # dmg + zip (run on a Mac)
```

Windows artifacts land in `release/`:

- `BattleBuddy Setup 0.1.0.exe` — **installer (give this to friends)** so they get update banners
- `BattleBuddy 0.1.0.exe` — portable (no auto-update)
- `win-unpacked/BattleBuddy.exe` — unpacked app (also usable)

Node 20+ is recommended. The Windows build skips code signing so it does not need symlink privileges for `winCodeSign`.

## Sharing with friends (auto-update)

Friends install **once** from a GitHub Release. When you publish a newer version, BattleBuddy checks on launch and shows a small banner: **Download** (installed apps) or **Open GitHub** (dev / portable). After download they click **Restart**.

1. Create a GitHub personal access token with `repo` scope and set `GH_TOKEN`.
2. Bump `"version"` in `package.json` (for example `0.1.1`).
3. Publish:

```bash
# Windows (from a Windows machine) — uploads the NSIS installer + latest.yml
npm run publish:win

# macOS (from a Mac)
npm run publish:mac
```

That creates a GitHub Release tagged `v0.1.1` with the installer. Auto-update uses that release — there is nothing to install by hand after the first Setup.exe / .dmg.

macOS auto-update works best with a signed/notarized build. Until you have an Apple Developer cert, friends on Mac can still use the banner’s GitHub link to download the new dmg.

## What v1 shows

- Combat odds at the top of the overlay once a fight starts (boards from `Power.log`; tavern-tier damage; Taunt, Divine Shield, Poisonous, Venomous, Reborn, Windfury, Cleave, stealth, deathrattles, Avenge, Rally, and Start of Combat parsed from card text). Unique scripts, hands, and trinkets are still incomplete.
- Hero name and this lobby’s tribes once you pick (pool stays hidden during hero select so it doesn’t cover the portraits)
- Session: start/current public MMR, games today, average finish, latest places
- Update banner on launch when a newer GitHub Release exists
- Lobby public MMR: names from `Power.log`, ratings from Blizzard’s published Battlegrounds leaderboard (region in settings). Unlisted players show `8000↓`. Names the log never prints stay `Unknown`
- Minion pool by tavern tier (HearthstoneJSON), with tile art

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

## Notes

- Public leaderboards cut off around 8000 MMR
- You can run Hearthstone Deck Tracker at the same time; you will see two overlays

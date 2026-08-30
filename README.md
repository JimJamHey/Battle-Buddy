# BattleBuddy

Battlegrounds-only overlay for Hearthstone on **Windows** and **macOS**. It is not a deck tracker. There is no constructed, arena, or mercenaries mode.

## Download (test group)

Testers should **not** install Node or run from source. Grab a build from GitHub:

**[Latest test build](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test)**

| File | What to do |
|---|---|
| `BattleBuddy-Setup.exe` | Double-click to install. Later launches check for updates. |
| `BattleBuddy-windows.zip` | Unzip and run `BattleBuddy.exe`. |
| `BattleBuddy.dmg` | Drag to Applications and open. |

Direct links:

- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy-Setup.exe
- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy-windows.zip
- https://github.com/JimJamHey/Battle-Buddy/releases/download/test/BattleBuddy.dmg

Start BattleBuddy, then Hearthstone. The overlay attaches to the game window.

## What it shows

- Combat odds at the top once a fight starts. Left is **Lethal** (you kill them); right is **Death** (you die). Boards, tavern-tier damage, keywords, deathrattles, Avenge, Rally, and Start of Combat come from card text. **Hands** and **trinkets** in Power.log are included.
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
- **MMR:** `https://hearthstone.blizzard.com/en-us/api/community/leaderboardsData` (cached). Post-game rating is also OCR’d from the Play/results screen on Windows and macOS.

BattleBuddy does not read Hearthstone process memory.

## Requirements

- Hearthstone running
- Node.js 20+ only if you develop from source; testers using Setup.exe / the zip do not need Node

## Run from source

```bash
npm install
npm run dev
```

The control window opens immediately. Start (or already have) Hearthstone. The overlay should snap to the client area within a second.

If this machine has never enabled Hearthstone file logs, BattleBuddy writes `%LocalAppData%\Blizzard\Hearthstone\log.config` (Windows) or `~/Library/Preferences/Blizzard/Hearthstone/log.config` (macOS) before the game launches. If Hearthstone Deck Tracker already enabled logs, live tracking works on the current session.

### macOS (from source)

`npm run dist:mac` compiles `src/platform/macHost.swift` into `resources/mac-host` so the overlay can follow the window without Accessibility. `npm run dev` falls back to System Events if that binary is missing.

## Packaged builds

GitHub Actions builds **Windows and macOS** and publishes the [test](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test) prerelease. Each test build bumps `0.1.0-test.<run>` so installed copies see a newer version. Tag `v0.1.1` (and bump `"version"` in `package.json`) for a numbered release.

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

### Code signing (owner)

GitHub cannot store a certificate *file*. You buy a Windows code-signing certificate, export it as a `.pfx` on your PC, convert that file to a long text string, and paste the text into a GitHub secret. There is no link to add.

You need a paid certificate from a vendor (Sectigo, DigiCert, SSL.com, etc.). Export it from Windows as a `.pfx` and pick a password. If you do not have that file yet, skip this section — testers will still see SmartScreen “unknown publisher.”

1. On your PC, convert the `.pfx` to text. **`C:\path\to\cert.pfx` below is a placeholder** — replace it with the real path to your exported file (e.g. `C:\Users\You\Downloads\BattleBuddy.pfx`).

   Check the file exists first:

```powershell
Test-Path 'C:\Users\You\Downloads\BattleBuddy.pfx'
```

   If that prints `True`, encode it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\Users\You\Downloads\BattleBuddy.pfx'))
```

   Or pick the file in a dialog (no typing paths):

```powershell
$f = (Get-Item (Read-Host 'Drag your .pfx here, or paste full path')).FullName
[Convert]::ToBase64String([IO.File]::ReadAllBytes($f)) | Set-Clipboard
Write-Host 'Copied to clipboard — paste into GitHub secret CSC_LINK'
```

That prints one long line of letters and numbers. Copy the whole line.

2. GitHub → this repo → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret name | What to paste |
|---|---|
| `CSC_LINK` | The long line from step 1 (no quotes) |
| `CSC_KEY_PASSWORD` | The password you set when exporting the `.pfx` |

**macOS** (optional, for Gatekeeper): same idea with a Developer ID Application `.p12`.

| Secret name | What to paste |
|---|---|
| `MAC_CSC_LINK` | `base64 -i DeveloperID.p12` output |
| `MAC_CSC_KEY_PASSWORD` | p12 password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (not your Apple login) |
| `APPLE_TEAM_ID` | 10-character Team ID |

3. Re-run **Actions → Release**. The rolling `test` tag is overwritten. Signed Setup.exe no longer shows SmartScreen.

Auto-update from a private repo needs the repo public or a GitHub token.

### Auto-update (installed copies)

Friends install **once** from the test Setup.exe. Later test builds increment the prerelease version; BattleBuddy checks on launch (including prereleases) and shows **Download**, then **Restart**.

Numbered tags (`v0.1.1`) still work the same way. Zip/portable copies get a GitHub link instead of in-place install.

1. Optional local publish: `GH_TOKEN` with `repo` scope, then `npm run publish:win` / `publish:mac`.
2. CI publishes the `test` prerelease from this workflow (including pull requests) and from `master`.

## Strategy curation

After a Battlegrounds patch:

```bash
npm run curate
```

That refreshes `data/pool-snapshot.json` from HearthstoneJSON, writes candidate comps, and flags curated comps whose core cards left the pool. Full process: [docs/strategy-curation.md](docs/strategy-curation.md).

## Notes

- Public leaderboards cut off around 8000 MMR
- You can run Hearthstone Deck Tracker at the same time; you will see two overlays

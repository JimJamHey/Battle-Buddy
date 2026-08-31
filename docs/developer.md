# Developer reference

Internal notes for maintainers and future agents. Not shown in the public README.

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

## Strategy curation

After a Battlegrounds patch:

```bash
npm run curate
```

See [strategy-curation.md](strategy-curation.md). Curated comps live in `data/strategies/curated.json`. Visual review: open [strategy-preview.html](strategy-preview.html) in a browser.

Overlay comps appear in the **Comps** panel (session rail) during a live BG match when lobby tribes match.

## Code signing

Unsigned builds are fine for a small test group. To remove SmartScreen/Gatekeeper warnings, add signing secrets in GitHub Actions — see [signing.md](signing.md).

## Updates (test channel)

- Installed copies **check** the `test` release on launch (`src/main/updater.ts`).
- Test builds use the rolling `test` tag (not semver) — updater uses a **generic feed** pointing at `releases/download/test/latest.yml`.
- `autoDownload` is off — users click **Download**, then **Restart** (or install on quit).
- Preferred installer for updates: `BattleBuddy-Setup.exe` (NSIS).

## Notes

- Public leaderboards top out around 8000 MMR; unlisted players show `8000↓` in the overlay.
- Hearthstone Deck Tracker can run alongside; users will see two overlays.
- Test battle tags in tests use `TestPlayer#1234` — never commit real BattleTags.

## Related docs

- [strategy-curation.md](strategy-curation.md)
- [signing.md](signing.md)
- [audit-report.md](audit-report.md)

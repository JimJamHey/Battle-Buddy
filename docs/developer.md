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
npm run dist:mac   # macOS packaging only
```

PRs run `.github/workflows/ci.yml` (unit tests + typecheck only). Installers are not built or published from pull requests.

Pushing `master` (or a `v*` tag) runs `.github/workflows/release.yml`: tests, then macOS packaging. Windows development uses `npm run dev` only. It still writes two GitHub Release tags for auto-update:

- Rolling `test` tag — generic feed at `releases/download/test/latest.yml`
- Semver tag `v0.1.0-test.<run>` — GitHub-provider clients (older testers)

The `version` job only computes `0.1.0-test.<run_number>`. Tag `v0.1.x` in `package.json` for numbered stable releases.

## Strategy curation

After a Battlegrounds patch:

```bash
npm run curate
```

See [strategy-curation.md](strategy-curation.md). Curated comps live in `data/strategies/curated.json`. Visual review: open [strategy-preview.html](strategy-preview.html) in a browser.

Overlay strategies appear in the **Strategies** pane. During a live match, lobby tribes sort to the top and the rest stay dimmed.

## Code signing

Unsigned builds are fine for a small test group. To remove SmartScreen/Gatekeeper warnings, add signing secrets in GitHub Actions — see [signing.md](signing.md).

## Updates (test channel)

- Installed copies **check** for a newer test build on launch (`src/main/updater.ts`).
- CI publishes the same installer twice:
  - Rolling `test` tag — generic feed at `releases/download/test/latest.yml` (and `test.yml`).
  - Semver tag `v0.1.0-test.<run>` — required by electron-updater's GitHub provider. Builds at `v0.1.0-test.26` and earlier ignore the `test` tag because it is not valid semver, so they cannot download unless this versioned release exists.
- `autoDownload` is off — users click **Download**, then **Restart** (or install on quit).
## Notes

- Public leaderboards top out around 8000 MMR; unlisted players show `8000↓` in the overlay.
- Hearthstone Deck Tracker can run alongside; users will see two overlays.
- Test battle tags in tests use `TestPlayer#1234` — never commit real BattleTags.

## Related docs

- [strategy-curation.md](strategy-curation.md)
- [signing.md](signing.md)
- [audit-report.md](audit-report.md)

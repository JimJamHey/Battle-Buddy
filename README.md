# BattleBuddy

Battlegrounds-only overlay for Hearthstone on **Windows** and **macOS**. Not a deck tracker — no constructed, arena, or mercenaries.

**Not open for contributions or forks.** This repo is published for downloads and transparency only.

## Run

**Windows** — from a clone of this repo:

```bash
npm install
npm run dev
```

**macOS** — install from the **[test release](https://github.com/JimJamHey/Battle-Buddy/releases/tag/test)** (`BattleBuddy.dmg`), or run `npm run dev` from source.

Start BattleBuddy, then Hearthstone.

## Features

- **Combat odds** — lethal vs death once a fight starts
- **Minion pool** — live card catalog by tavern tier with art
- **Strategies** — curated lines for this lobby’s tribes
- **Session** — start/current MMR, games today, average place, recent boards
- **Updates** — installed copies check the rolling `test` release on launch

### Hotkeys

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+Shift+B | Toggle overlay |
| Ctrl/Cmd+Shift+1–7 | Peek tavern tier |
| Ctrl/Cmd+Shift+0 | All tiers |
| Ctrl/Cmd+Shift+C | Click-through off for 5s (pool) |
| Ctrl/Cmd+Shift+L | Unlock layout — drag panels |

# Dungeon Depths

A Diablo-style roguelite for iOS/Android built with React Native + Expo.

Three classes (Warrior · Rogue · Sorcerer), 10-floor tiers, turn-based combat, loot, crafting, and a persistent meta-layer. Difficulty scales through Normal → Nightmare → Hell across class-specific waypoints.

---

## Dev Setup & Testing with Expo Go

### Prerequisites

- [Node.js](https://nodejs.org) 18+ or [Bun](https://bun.sh) (preferred)
- [Expo Go](https://expo.dev/go) installed on your iOS or Android device
- Both your phone and dev machine on the same Wi-Fi network

### Install

```bash
cd D2Game
bun install          # or: npm install
```

### Run

```bash
bun run start        # starts the Expo dev server
```

Scan the QR code in the terminal with:
- **iOS**: Camera app
- **Android**: Expo Go app

The app hot-reloads on save. If the QR code doesn't connect, press `w` to open web preview, or `a`/`i` for Android/iOS simulators if you have them installed.

### Platform flags

```bash
bun run ios          # iOS simulator (requires Xcode on Mac)
bun run android      # Android emulator (requires Android Studio)
bun run web          # Web preview (limited — no haptics, SQLite)
```

### Run tests

```bash
bun test             # engine unit tests (combat, balance, stats)
bun run typecheck    # TypeScript type check (no emit)
```

### Run balance sims

```bash
bun run sim:combat   # 800-player NM/Hell balance sim
bun run sim:floors   # Full run progression sim (400 players × 30 runs)
bun run sim:loot     # Loot distribution analysis
```

---

## Project Structure

```
src/
  data/         — classes, skills, monsters, items, recipes, codex data
  engine/       — combat, stats, loot, grid, encounter, status effects
  store/        — Zustand stores (game, combat, grid, inventory, stash)
  screens/      — full-screen views (Grid, Combat, ClassSelect, Codex, ...)
  components/   — shared UI (HUD, PlayerPortrait, TierClearOverlay, ...)
  sim/          — balance/progression simulation scripts
  utils/        — tierName, itemDisplay helpers
features/       — LAC feature.json specs for all 44 features
assets/         — icons, splash
```

## Difficulty System

| Tier | Difficulty | Monster HP | Monster DMG | MF Bonus |
|------|-----------|-----------|------------|---------|
| 1    | NORMAL    | 1.0×      | 1.00×      | —       |
| 2    | NIGHTMARE | 2.5×      | 1.80×      | +20     |
| 3+   | HELL      | 3.1×      | 2.00×      | +20/tier|

Clear floor 10 to advance tiers. Tier persists across deaths. Waypoints unlock per-class at F1/5/10/15/20/25/30.

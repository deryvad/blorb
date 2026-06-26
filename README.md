# Blorb

A cozy drop-and-merge bubble puzzle. Drop a bubble; when two of the same size
touch, they merge into the next size up. Keep the stack below the line, chase a
high score, and try to make the biggest bubble of all.

> One mode, one mechanic. The whole point is the *feel* — a tight, satisfying
> merge loop with juice, sound, and a clean UI.

Built with **Phaser 3** (TypeScript) + **Vite**, wrapped for desktop with
**Tauri v2**. The exact same web bundle runs in a plain browser, so there's a
free web build as a byproduct of the desktop build.

---

## Play

- **Aim & drop:** move the mouse and click where the bubble should fall.
- **Keyboard:** `A` / `D` or `←` / `→` to move, `Space` to drop.
- **Pause:** `Esc`  ·  **Restart:** `R`
- **Goal:** merge matching bubbles into bigger ones. Don't let the stack stay
  above the line. Merge the two largest bubbles and they pop for a bonus.

Score, best score, mute, and volume persist locally between sessions.

---

## Develop

Requirements: **Node 18+**. For the desktop build you also need the
**Rust toolchain** (via [rustup](https://rustup.rs)) and the platform's Tauri
prerequisites — see <https://v2.tauri.app/start/prerequisites/>.

```bash
npm install        # install dependencies
npm run dev        # Vite dev server at http://localhost:5173 (web)
npm run tauri dev  # run inside the native desktop window (hot-reloads)
```

## Build

### Web

```bash
npm run build      # type-checks, then bundles to ./dist
npm run preview    # serve the production bundle locally to verify
```

`./dist` is a static site — drop it on itch.io, Netlify, GitHub Pages, or any
static host.

### Desktop (Tauri)

```bash
npm run tauri build
```

Produces a standalone app under
`src-tauri/target/release/bundle/`:

- **macOS** — `macos/Blorb.app` and a `dmg/Blorb_<version>_<arch>.dmg`
- **Windows** — `.exe` / `.msi` (build *on* Windows or in Windows CI)
- **Linux** — `.AppImage` / `.deb`

> Each platform's installer must be built on that platform (or its CI runner).
> The macOS `.app` is unsigned/ad-hoc — fine for local use; for distribution
> you'll want an Apple Developer certificate + notarization (and a code-signing
> cert on Windows).

---

## Project layout

```
src/
  main.ts              Phaser game config + global error overlay
  config/tuning.ts     Single source of truth for every tunable number
  scenes/
    BootScene.ts       Preloads assets, generates bubble textures + icons
    BackgroundScene.ts Ambient drifting-bubble backdrop
    TitleScene.ts      Title / menu / settings
    GameScene.ts       Playfield: physics, dropping, merging, lose logic
    UIScene.ts         HUD overlay (score, next, ladder, buttons)
  objects/
    Fruit.ts           A bubble: Matter body + rendered circle
    Dropper.ts         Held bubble + player input
  audio/sfx.ts         Synthesized SFX + looped music (public/fizzy.mp3)
  steam/steam.ts       Steam integration — STUBBED (see below)
  layout.ts            Responsive portrait/landscape layout math
  storage.ts           localStorage persistence (high score, mute, volume)
public/                Static assets copied verbatim (logo, icon, fizzy.mp3)
src-tauri/             Tauri v2 desktop wrapper (Rust)
```

All gameplay/feel numbers live in `src/config/tuning.ts` — tier sizes/colors,
physics, spawn weights, drop cooldown, and the juice (pop, shake, combo)
parameters. Tune the game there.

## Audio

No music/SFX middleware. Sound effects (merge, drop, top-tier jackpot, game
over) are synthesized on the fly with the Web Audio API. Background music is a
single looped file, `public/fizzy.mp3`, decoded into the same audio context so
the in-game mute toggle and volume slider control everything. Audio unlocks on
the first interaction (browser autoplay policy).

## Steam

`src/steam/steam.ts` is the **integration point** and is currently a no-op stub
(`initSteam`, `unlockAchievement`, `submitScore`). The game runs identically in
a browser or on the desktop with zero Steam dependency. When you're ready to
ship on Steam, wire [steamworks.js](https://github.com/ceifa/steamworks.js) into
those functions — the rest of the game already calls them.

## Scope

Intentionally small. Out of scope by design: power-ups / special bubbles /
bombs, skins / cosmetics / shops, and online leaderboards or accounts. The
prototype ships the core feel first.

# Merge Puzzle — Build Plan (Claude Code Execution Spec)

> Stack: **Phaser 3 (TypeScript)** for game + physics, **Tauri** as the desktop/Steam wrapper, **steamworks.js** for Steam integration
> Target: shippable Steam prototype of a Suika-style drop-and-merge game
> Scope rule: **one mode, one mechanic.** Do not add features not listed here. Ship the feel.

---

## How to use this document

You are Claude Code executing this plan. Work **phase by phase, in order**. After each phase, stop and confirm the acceptance criteria pass before moving on. Do not skip ahead. Do not add scope. If something is ambiguous, choose the simplest implementation that satisfies the stated criteria.

Keep all gameplay numbers (restitution, friction, density, tier scores, spawn weights) in a single tunable config module so balancing happens in one place.

---

## Stack rationale (do not deviate without asking)

- **Phaser 3 + TypeScript** — bundles a renderer and the **Matter.js** physics engine, which is what the merge feel depends on. Build in the language the team already knows.
- **Tauri** (not Electron) — Rust-based wrapper with small binaries (~3-10MB) and low memory, much better for a Steam title than Electron's ~100MB+ footprint. Same web frontend either way, so the game code is wrapper-agnostic.
- **steamworks.js** — Node/Rust bindings to the Steamworks SDK for achievements/leaderboards. Stubbed for now, integrated only when asked.
- A **web build is a free byproduct** — the same Phaser bundle can ship to itch.io for marketing. Keep the game code free of Tauri-specific calls so it runs in a plain browser too.

---

## Game definition (the whole game)

- A vertical container open at the top.
- Player moves a "next" fruit left/right along the top and drops it.
- Fruits fall, collide, and settle with physics.
- Two fruits of the **same tier** that touch **merge** into **one fruit of the next tier** at their midpoint, and award score.
- A merge can cascade (the new fruit touches another of its tier, merges again).
- If the stack stays above the **lose line** for longer than a grace period, the game ends.
- Goal: highest score. That is it.

There are (for example) 8-11 tiers, smallest to largest. The largest tier, when two merge, can either vanish for big points or stay (decide in Phase 4 tuning — default: they merge into nothing for a big score burst).

---

## Phase 0 — Project setup

**Tasks**
1. Scaffold a **Vite + TypeScript** project. Add **Phaser 3** as a dependency.
2. Add **Tauri** to the project (`@tauri-apps/cli`), configured to load the Vite dev server in dev and the built `dist/` in production.
3. Configure a portrait game canvas (e.g. 540×960) with Phaser's Scale Manager set to `FIT` so it scales cleanly in the Tauri window and in a browser.
4. Use **Matter.js physics** (Phaser's built-in Matter integration — `physics: { default: 'matter' }`), not Arcade physics. Arcade can't do the rotational/jostle feel.
5. Create folder structure:
   ```
   /src
     /scenes      (BootScene, GameScene, UIScene)
     /objects     (Fruit.ts, Dropper.ts)
     /config      (tuning.ts — single source of truth for all numbers)
     /steam       (steam.ts — stubbed integration layer)
   /src-tauri     (Tauri Rust shell, generated)
   /assets        (placeholder art; circles are fine)
   ```
6. Add `src/config/tuning.ts` exporting all tunable constants (tier definitions, physics params, spawn weights, scores).

**Acceptance criteria**
- `npm run dev` runs the game in a browser.
- `npm run tauri dev` runs the same game in a native Tauri window.
- Matter physics is the active engine.
- `tuning.ts` is imported wherever numbers are needed (no magic numbers elsewhere).

---

## Phase 1 — The container and a single dropping fruit

**Tasks**
1. In `GameScene`, build the container: left, right, and floor as **static Matter bodies**. Open top.
2. Create `Fruit.ts`: a class wrapping a **Matter circle body** + a Phaser image/graphics for the visual. Expose a `tier: number` property.
3. Fruit radius, color, density, and score scale with `tier`, all read from `tuning.ts`.
4. Spawn one fruit at the top center; let it fall, collide with floor and walls, and settle under gravity.

**Acceptance criteria**
- A single fruit drops, collides with floor and walls, and comes to rest.
- Changing `tier` changes the fruit's size and color.
- The visual stays locked to its physics body (position + rotation) every frame.

---

## Phase 2 — The dropper (player input)

**Tasks**
1. Create a `Dropper` that holds the **current** fruit at the top as a **non-simulated** visual (static or sensor body) following horizontal input.
2. Input: A/D or Left/Right arrows **and** pointer/mouse X move the held fruit horizontally, clamped inside the walls.
3. On Space / click / Down: **release** — convert the held fruit into a live dynamic Matter body so it falls.
4. After a short cooldown, load the **next** fruit into the dropper. Show a **next-fruit preview**.
5. Spawn tier is weighted toward small tiers; weights read from `tuning.ts` (only the lowest ~4-5 tiers ever spawn from the dropper).

**Acceptance criteria**
- Player can move the held fruit (keyboard and mouse) and drop it.
- A new fruit appears after each drop following a cooldown.
- Next-fruit preview is visible and accurate.
- Only low tiers spawn from the dropper.

---

## Phase 3 — The merge mechanic (the core)

**Tasks**
1. Listen for Matter **collision events** (`matter.world.on('collisionstart', ...)`). For each contact pair, check whether both bodies are fruits of the **same tier**.
2. On a same-tier collision:
   - Compute the **midpoint** of the two bodies.
   - **Destroy both** fruits (remove bodies + visuals).
   - **Spawn one fruit of `tier + 1`** at the midpoint as a live dynamic body.
   - Award score for that merge (score per tier from `tuning.ts`).
3. Guard against **double-processing**: a single Matter collision can surface the same pair more than once across frames, and cascades can reference an already-destroyed body. Tag each fruit with a unique id and a `merging`/`destroyed` flag; process each pair **exactly once** and ignore any body already flagged. This is the most common bug in these games — handle it deliberately.
4. Handle **cascades**: the newly spawned fruit is a normal fruit, so if it lands on another of its tier it merges again naturally. Verify cascades work and never double-spawn.
5. Handle the **top tier**: when two top-tier fruits merge, either remove both for a big score (default) or spawn a capstone — pick one and put the choice in `tuning.ts`.

**Acceptance criteria**
- Two same-tier fruits reliably merge into one of the next tier, **exactly once** (no duplicate spawns, no lost or double-counted score).
- Score increases correctly on each merge.
- Cascading merges work (one merge can trigger the next).
- Different tiers never merge.
- Destroying a body never throws (no references to removed Matter bodies).

---

## Phase 4 — Feel and tuning (where the game actually lives)

> This is the most important phase. The merge mechanic is done; now make it *satisfying*.

**Tasks**
1. **Physics tuning** in `tuning.ts`: density/mass, `restitution` (bounce), `friction`, `frictionStatic`, gravity, air friction per tier. Goal: fruits feel weighty and jostly, settle without endless jitter, and a merge causes a satisfying shift in the pile.
2. **Juice** (add all of these — they are what make it addictive):
   - Scale "pop" tween on a newly merged fruit.
   - Particle burst or flash on merge.
   - Subtle camera shake on big-tier merges (`this.cameras.main.shake`).
   - A distinct sound per merge tier (rising pitch by tier is a cheap, great effect).
   - Floating score number at the merge location.
3. **Anti-jitter**: tune `sleepThreshold` / friction / air friction so a settled pile goes quiet instead of vibrating. Matter's sleeping can be enabled to help.
4. **Drop cadence**: tune the post-drop cooldown so it feels responsive but prevents spam-stacking.

**Acceptance criteria**
- Dropping and merging *feels good* — playtesters reflexively keep playing.
- A settled pile is visually quiet (no permanent jitter).
- Every merge gives clear visual + audio feedback.

---

## Phase 5 — Lose condition and game loop

**Tasks**
1. Draw a **lose line** near the top of the container.
2. Track any fruit resting **above** the lose line for longer than a grace period (e.g. ~2 seconds) so a transient bounce above the line does not instantly end the run.
3. On lose: freeze input, show **Game Over** with final score and a **Restart** button.
4. Restart fully resets the board, score, and dropper (cleanly destroy all Matter bodies — watch for leaks).
5. Persist a **high score** locally (Tauri filesystem/store in the desktop build; `localStorage` fallback for the web build).

**Acceptance criteria**
- Game ends only when the stack genuinely overflows past the grace period (not on a transient bounce).
- Game Over screen shows score and restarts cleanly with no leftover bodies.
- High score persists across runs in both desktop and web builds.

---

## Phase 6 — Minimal UI and polish pass

**Tasks**
1. Run UI in a **separate Phaser Scene** (`UIScene`) layered over `GameScene`: current score, high score, next-fruit preview.
2. Title screen with Play button, and the **tier chart** (which fruit merges into which) shown somewhere — players want to learn the ladder.
3. Pause (Esc).
4. One coherent visual pass on placeholder art (consistent palette; clean readable circles are fine). Readability of tier > fancy art.
5. Settings: master volume + mute. Nothing more.

**Acceptance criteria**
- A new player can understand and play with no explanation.
- The tier ladder is discoverable.
- Audio can be muted.

---

## Phase 7 — Steam build readiness (prototype, not store launch)

> Do the technical prep; the actual Steam page / launch is a human task.

**Tasks**
1. Configure **Tauri build** to produce a runnable desktop binary for **Windows** (and Linux/macOS if trivial). Confirm the production build loads `dist/` and runs standalone with no dev server.
2. Keep all game logic wrapper-agnostic so the same bundle still runs in a plain browser (web/itch.io build from `npm run build`).
3. Create `src/steam/steam.ts` as a **stubbed** integration layer with no-op functions (`initSteam()`, `unlockAchievement(id)`, `submitScore(n)`). Leave a clear `// STEAM INTEGRATION POINT` note. Wire **steamworks.js** in only when explicitly asked — it adds the Steamworks SDK + appid setup overhead. Do **not** integrate it now.
4. Write a short `README.md`: how to run dev (web + Tauri), how to build both targets, and where the tuning knobs live.

**Acceptance criteria**
- `npm run tauri build` produces a double-clickable Windows binary that runs the full game loop standalone.
- `npm run build` produces a browser-playable web build.
- README explains both build paths + tuning.

---

## Out of scope (do NOT build unless explicitly asked)

- Multiple game modes, timed modes, daily challenges.
- Power-ups, special fruits, bombs.
- Skins / cosmetics / shops.
- Online leaderboards or accounts (leave the stubbed integration layer only).
- Tutorials beyond the tier chart.
- Actual steamworks.js wiring (stub only until asked).

Adding any of these before the core feels perfect is the failure mode. Ship the feel first.

---

## Definition of done (prototype)

- [ ] Drop -> merge -> cascade -> score loop fully works, no duplicate-merge bug.
- [ ] The pile feels physically satisfying and goes quiet when settled.
- [ ] Every merge has visual + audio feedback.
- [ ] Lose condition is fair (grace period), Game Over + Restart work, high score persists.
- [ ] New player understands it unassisted.
- [ ] Standalone Windows (Tauri) build runs, and a web build runs in a browser.
- [ ] All tuning numbers live in `src/config/tuning.ts`.
- [ ] Steam layer is stubbed and clearly marked, not integrated.

---

## First message to give Claude Code

> "Read BUILD_PLAN.md. Execute Phase 0, then stop and show me the project structure and confirm that both `npm run dev` (browser) and `npm run tauri dev` (native window) launch the empty game before continuing to Phase 1."

Drive it phase by phase. Review the *feel* yourself at Phase 4 — that judgment can't be delegated.
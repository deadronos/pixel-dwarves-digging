# Pixel Dwarves Digging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a playable React 19 + TypeScript 7 + R3F side-on autonomous pixel excavation simulator with deterministic terrain, dwarf logistics, global inventory, prestige, and portable saves.

**Architecture:** Keep a renderer-independent simulation core under src/game with seeded generation, fixed-step ticking, task planning, prestige, and JSON serialization. Use an external store to run the simulation independently of React rendering, then present snapshots through an R3F orthographic viewport and an accessible React DOM HUD.

**Tech Stack:** React 19, TypeScript 7, Vite, Three.js, @react-three/fiber, @react-three/drei, Zustand, Vitest, ESLint, Playwright/browser smoke test.

---

## File map

- Create: package.json, tsconfig.json, tsconfig.node.json, vite.config.ts, index.html, eslint.config.js
- Create: src/main.tsx, src/App.tsx, src/styles.css
- Create: src/game/types.ts — domain types, constants, and serialized save schema.
- Create: src/game/rng.ts — deterministic seeded random helpers.
- Create: src/game/content.ts — block, biome, policy, and upgrade definitions.
- Create: src/game/generation.ts — deterministic 160 × 80 terrain generator.
- Create: src/game/pathfinding.ts — bounded grid reachability and shortest paths.
- Create: src/game/engine.ts — fixed-step simulation, task planning, digging, hauling, completion.
- Create: src/game/progression.ts — prestige rules and permanent upgrade costs/effects.
- Create: src/game/serialization.ts — versioned save validation/export/import helpers.
- Create: src/game/state.ts — Zustand store, simulation clock, speed controls, autosave.
- Create: src/game/*.test.ts — focused Vitest behavior tests matching each pure module.
- Create: src/components/WorldCanvas.tsx — R3F orthographic world viewport.
- Create: src/components/TerrainLayer.tsx — instanced block rendering.
- Create: src/components/DwarfLayer.tsx — dwarf sprites/markers.
- Create: src/components/Hud.tsx — top inventory bar and status.
- Create: src/components/ControlBar.tsx — time, policy, save/import, and reset controls.
- Create: src/components/Inspector.tsx — progress, discovery, and policy summary.
- Create: e2e/smoke.spec.ts — browser smoke test if Playwright is available.
- Create: README.md — run, test, controls, save format, and game loop notes.
- Modify: idea.md — user-facing game idea and implementation decisions.

---

### Task 1: Bootstrap the Vite application and toolchain

**Files:**
- Create: package.json
- Create: tsconfig.json
- Create: tsconfig.node.json
- Create: vite.config.ts
- Create: index.html
- Create: eslint.config.js
- Create: src/main.tsx
- Create: src/App.tsx
- Create: src/styles.css

- [ ] **Step 1: Create the package manifest with the current compatible React/R3F stack**

Use npm registry metadata to resolve current versions for React 19, TypeScript 7, Vite, R3F, Three.js, Zustand, Vitest, and ESLint. Put runtime dependencies in dependencies and test/build/lint tooling in devDependencies. Add scripts: dev, build, typecheck, lint, test, test:watch, and preview.

- [ ] **Step 2: Add the strict TypeScript/Vite configuration**

Configure strict TypeScript, noEmit, JSX transform, DOM and ES2022 libraries, module resolution compatible with Vite, and a separate Node config for vite.config.ts.

- [ ] **Step 3: Add the minimal app entry and a visible shell**

Render App from src/main.tsx. Start App.tsx with a named PIXEL DWARVES heading and a terrain-workspace placeholder so the first build proves the setup before game code is added.

- [ ] **Step 4: Add ESLint and Vitest configuration**

Configure ESLint for TypeScript and React hooks, and configure Vitest with a jsdom environment for game tests that touch browser-safe helpers.

- [ ] **Step 5: Verify the bootstrap**

Run npm install, npm run typecheck, npm run lint, npm test -- --run, and npm run build. Expected: all commands exit 0.

- [ ] **Step 6: Commit**

    git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html eslint.config.js src/main.tsx src/App.tsx src/styles.css
    git commit -m "chore: bootstrap pixel dwarves app"

---

### Task 2: Define domain content and deterministic terrain

**Files:**
- Create: src/game/types.ts
- Create: src/game/rng.ts
- Create: src/game/content.ts
- Create: src/game/generation.ts
- Test: src/game/generation.test.ts

- [ ] **Step 1: Write failing generation tests**

Add tests that assert:
- Same seed and run produces the same map.
- All requested biome bands exist with matching surface materials.
- The starting pocket and exposed first work are reachable.
- At least one reachable mineral exists in a normal run.

Use a fixed seed and compare explicit map cells, biome ids, and the generated stockpile location.

- [ ] **Step 2: Run the generation tests and verify the expected failure**

Run npm test -- src/game/generation.test.ts --run. Expected: failure because generator types/functions do not exist.

- [ ] **Step 3: Implement domain types and content tables**

Define BlockType, BiomeId, PolicyState, UpgradeLevels, DwarfState, TaskState, SimulationState, SerializedSave, MAP_WIDTH = 160, and MAP_HEIGHT = 80. Define material colors, dig durations, inventory labels, biome surface/layer tables, policy defaults, and upgrade effects in one content module.

- [ ] **Step 4: Implement deterministic RNG and generation**

Use a string-to-seed hash plus a small deterministic PRNG. Generate biome bands, smoothed surface heights, layered solids, ore/relic pockets, a surface start pocket, and a stockpile. Store blocks in a flat array using index = y * width + x. Add a deterministic repair pass that guarantees a reachable low-tier target and reachable mineral.

- [ ] **Step 5: Run the generation tests and verify they pass**

Run npm test -- src/game/generation.test.ts --run. Expected: all generation tests pass.

- [ ] **Step 6: Commit**

    git add src/game/types.ts src/game/rng.ts src/game/content.ts src/game/generation.ts src/game/generation.test.ts
    git commit -m "feat: add deterministic biome terrain generation"

---

### Task 3: Implement pathfinding and autonomous dig/haul simulation

**Files:**
- Create: src/game/pathfinding.ts
- Create: src/game/engine.ts
- Test: src/game/pathfinding.test.ts
- Test: src/game/engine.test.ts

- [ ] **Step 1: Write failing pathfinding and engine tests**

Cover:
- Finds a shortest walkable path around solid blocks.
- Assigns an exposed block to an idle dwarf.
- Moves, digs, hauls, and increments global inventory.
- Uses ore-first policy when an ore target is exposed.
- Reports completed when every solid block is air.

Construct a small 12 × 8 fixture state for fast unit tests rather than relying on the full generated map.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run npm test -- src/game/pathfinding.test.ts src/game/engine.test.ts --run. Expected: failure because pathfinding and engine functions do not exist.

- [ ] **Step 3: Implement bounded walkability and paths**

Treat air and stockpile cells as walkable. Use breadth-first search with stable neighbor order to find reachable cells and shortest paths. Expose helpers for adjacent exposed solids, nearest stockpile, and path reconstruction.

- [ ] **Step 4: Implement the fixed-step engine**

Add stepSimulation(state, tickCount). On each tick, assign tasks using policy scoring, advance each dwarf along its path, progress digging beside a target, convert the target to air, add inventory, create a haul task, move carried material to stockpile, and mark completed when no solid blocks remain. Keep all functions pure: return a new state rather than mutating React state.

- [ ] **Step 5: Run the simulation tests and verify they pass**

Run npm test -- src/game/pathfinding.test.ts src/game/engine.test.ts --run. Expected: all tests pass.

- [ ] **Step 6: Commit**

    git add src/game/pathfinding.ts src/game/engine.ts src/game/pathfinding.test.ts src/game/engine.test.ts
    git commit -m "feat: simulate autonomous dwarf excavation"

---

### Task 4: Add prestige progression and versioned saves

**Files:**
- Create: src/game/progression.ts
- Create: src/game/serialization.ts
- Test: src/game/progression.test.ts
- Test: src/game/serialization.test.ts
- Modify: src/game/types.ts if schema fields need completion.

- [ ] **Step 1: Write failing progression and serialization tests**

Cover:
- Awards a full-clear prestige and preserves permanent upgrades.
- Allows relic discovery to unlock an early-prestige reward.
- Rejects a malformed or unsupported save.
- Round-trips a complete simulation state through JSON.

- [ ] **Step 2: Run tests and verify the expected failure**

Run npm test -- src/game/progression.test.ts src/game/serialization.test.ts --run. Expected: failure because progression and serialization functions do not exist.

- [ ] **Step 3: Implement progression rules**

Define upgrade costs, effects, full-clear reward, relic early-prestige reward, and startPrestige(state, mode). Reset map/run state while preserving prestige currency and upgrade levels, then generate the next deterministic run.

- [ ] **Step 4: Implement schema-versioned JSON saves**

Define SAVE_VERSION = 1, serialize only plain JSON values, validate required fields and dimensions on import, and return user-facing validation errors without throwing opaque parsing failures. Include helpers for local-storage payloads and downloadable export strings.

- [ ] **Step 5: Run the progression and serialization tests**

Run npm test -- src/game/progression.test.ts src/game/serialization.test.ts --run. Expected: all tests pass.

- [ ] **Step 6: Commit**

    git add src/game/progression.ts src/game/serialization.ts src/game/progression.test.ts src/game/serialization.test.ts src/game/types.ts
    git commit -m "feat: add prestige and portable saves"

---

### Task 5: Wire the simulation store and time controls

**Files:**
- Create: src/game/state.ts
- Test: src/game/state.test.ts

- [ ] **Step 1: Write failing store behavior tests**

Cover:
- Starts a deterministic run with default policies.
- Advances only when unpaused.
- Respects 1x, 2x, and 4x speed.
- Updates policies without replacing unrelated state.
- Exports and imports the active save.

- [ ] **Step 2: Run the store tests and verify the expected failure**

Run npm test -- src/game/state.test.ts --run. Expected: failure because the store does not exist.

- [ ] **Step 3: Implement the external store**

Create the Zustand store containing the current SimulationState, pause/speed controls, one fixed-tick interval, policy setters, save/load actions, export/import actions, and new run/reset actions. Autosave to localStorage with a safe storage key after meaningful state changes. Keep simulation time in ticks and compute the number of engine steps from elapsed render time and speed.

- [ ] **Step 4: Run the store tests**

Run npm test -- src/game/state.test.ts --run. Expected: all store tests pass.

- [ ] **Step 5: Commit**

    git add src/game/state.ts src/game/state.test.ts
    git commit -m "feat: connect simulation loop and persistence"

---

### Task 6: Build the R3F world viewport

**Files:**
- Create: src/components/WorldCanvas.tsx
- Create: src/components/TerrainLayer.tsx
- Create: src/components/DwarfLayer.tsx
- Modify: src/App.tsx
- Modify: src/styles.css

- [ ] **Step 1: Add the R3F viewport with an orthographic camera**

Render the map in a full-width workspace with a camera centered on the current map and a world-to-screen scale that keeps blocks crisp. Enable nearest filtering, disable antialiasing where appropriate, and keep camera panning/zoom within map bounds.

- [ ] **Step 2: Render blocks by material using instanced meshes**

Group solid cells by BlockType, use one instanced mesh per material, set instance positions to integer grid coordinates, and use content-table colors. Render empty space as a dark subterranean background with biome surface highlights.

- [ ] **Step 3: Render dwarves and active task markers**

Render each dwarf as a small pixel-style mesh or sprite with a stable color per dwarf, a carried-block accent, and a small marker for its current task target. Add a brief digging particle/pop effect keyed by a monotonically increasing event id from the simulation snapshot.

- [ ] **Step 4: Verify the app compiles with R3F**

Run npm run typecheck and npm run build. Expected: both commands exit 0.

- [ ] **Step 5: Commit**

    git add src/components/WorldCanvas.tsx src/components/TerrainLayer.tsx src/components/DwarfLayer.tsx src/App.tsx src/styles.css
    git commit -m "feat: render the pixel excavation world in r3f"

---

### Task 7: Build the HUD, policies, controls, inspector, and reset flow

**Files:**
- Create: src/components/Hud.tsx
- Create: src/components/ControlBar.tsx
- Create: src/components/Inspector.tsx
- Modify: src/App.tsx
- Modify: src/styles.css
- Modify: idea.md

- [ ] **Step 1: Add the global inventory HUD**

Show counts for every mined material, total blocks cleared, dwarf count, seed/run, prestige currency, and a progress indicator. Use text labels and accessible buttons so browser smoke tests can target them.

- [ ] **Step 2: Add time and policy controls**

Implement pause, 1x, 2x, and 4x buttons; work preference selection; material-priority toggles; and hauling preference selection. Display the current selection visibly.

- [ ] **Step 3: Add save/export/import controls**

Use a hidden file input for JSON import, a download action for export, a visible save status label, and a clear validation error region. Do not silently discard invalid imports.

- [ ] **Step 4: Add inspector and prestige/reset actions**

Show run progress, current biome/material details, discoveries, active policy, and upgrade buttons with costs. Enable full-clear prestige and relic early-prestige only when their conditions are met. Confirm destructive new-run/reset actions.

- [ ] **Step 5: Add responsive visual styling**

Use the approved dark charcoal, parchment, brass, and muted biome palette. Keep the terrain dominant, avoid dense card grids, use pixel-oriented type treatment, and add restrained transitions for inventory updates, task changes, and prestige.

- [ ] **Step 6: Document the idea and controls**

Write idea.md with the concept, game loop, block/biome list, autonomous policy rules, prestige loop, serialization plan, and the deferred questions from the design.

- [ ] **Step 7: Run the full static validation**

Run npm run typecheck, npm run lint, npm test -- --run, and npm run build. Expected: all commands exit 0.

- [ ] **Step 8: Commit**

    git add src/components/Hud.tsx src/components/ControlBar.tsx src/components/Inspector.tsx src/App.tsx src/styles.css idea.md
    git commit -m "feat: add autonomous colony controls and hud"

---

### Task 8: Add browser smoke verification and final documentation

**Files:**
- Create: e2e/smoke.spec.ts if Playwright is available.
- Create: README.md
- Modify: package.json only if an e2e script is needed.

- [ ] **Step 1: Add the browser smoke test**

Start the Vite dev server, open the app, and assert the presence of the game title, terrain viewport, inventory labels, dwarf count, and time controls. Click 2x, wait for inventory or progress to change, export the save, import it back, and assert no visible error. If the generated map does not reach prestige in a short test window, use a deterministic test-only query parameter or exposed dev action to exercise the reset/prestige path without changing production behavior.

- [ ] **Step 2: Write the README**

Document prerequisites, install/run commands, control meanings, simulation architecture, save export/import, and current deferred features.

- [ ] **Step 3: Run full verification**

Run npm run typecheck, npm run lint, npm test -- --run, npm run build, and npm run dev -- --host 127.0.0.1. Use the browser smoke tool against the dev server and inspect the browser console for errors. Expected: static checks exit 0, the browser loads the world, and the smoke flow completes without console errors.

- [ ] **Step 4: Review the final diff**

Run git status --short, git diff --stat HEAD~8..HEAD, and git log --oneline -10. Confirm all requested functionality is represented and no generated build artifacts or secrets are committed.

- [ ] **Step 5: Commit**

    git add e2e/smoke.spec.ts README.md package.json
    git commit -m "test: verify playable pixel dwarves flow"


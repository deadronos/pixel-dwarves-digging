# Performance Bottlenecks Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce worst-case engine and terrain-rendering stalls without changing simulation semantics.

**Architecture:** Use virtual cell overrides and ordered/cached safety evaluation in the pure simulation core. Incrementally update the existing instanced terrain meshes from changed cell identities, then lazy-load and lightly constrain the R3F surface.

**Tech Stack:** React 19, React Three Fiber, Three.js, TypeScript 7, Vitest, Vite.

---

### Task 1: Add virtual dig overrides to pathfinding

**Files:**
- Modify: `src/game/pathfinding.ts`
- Modify: `src/game/logistics.ts`
- Test: `src/game/pathfinding.test.ts`
- Test: `src/game/logistics.test.ts`

- [ ] **Step 1: Write failing tests for virtual dig routing.**

Add a pathfinding test where the only route to a stockpile crosses a solid target. Call `findPath(world, from, to, target)` and assert that the returned path exists while the ordinary call returns `null`. Add a logistics test asserting `assessDigSafety` accepts a target whose removal opens the return route.

- [ ] **Step 2: Run the focused tests and confirm the expected failure.**

Run `PATH=/Users/openclaw/.vite-plus/bin:/opt/homebrew/bin:$PATH npm test -- --run src/game/pathfinding.test.ts src/game/logistics.test.ts`.

- [ ] **Step 3: Implement the override plumbing.**

Thread an optional `cleared: Position` through `isSupported`, walkability checks, BFS creation, `findPath`, and storage-destination selection. Treat only that coordinate as air; do not allocate a modified `World` or `cells` array.

- [ ] **Step 4: Replace per-candidate world cloning in safety checks.**

Update `assessDigSafety` to check support and storage reachability against the virtual override and remove the `simulateDigWorld` allocation from this path.

- [ ] **Step 5: Run focused tests and commit.**

Run the focused tests again, then commit with `perf: evaluate dig safety without world clones`.

### Task 2: Order and cache planner safety work

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/logistics.ts`
- Modify: `src/game/content.ts`
- Modify: `src/game/generation.ts`
- Modify: `src/game/pathfinding.ts`
- Modify: `src/components/Hud.tsx`
- Modify: `src/components/Inspector.tsx`
- Test: `src/game/engine.test.ts`

- [ ] **Step 1: Write failing planner tests.**

Add a test with one safe high-score target and many lower-score targets; assert that the high-score target is selected without changing the existing score/tie-break result. Add a test that repeated safety checks for the same world, stand, target, and storage reservations return the same result.

- [ ] **Step 2: Run the focused engine test and confirm the failure.**

Run `PATH=/Users/openclaw/.vite-plus/bin:/opt/homebrew/bin:$PATH npm test -- --run src/game/engine.test.ts`.

- [ ] **Step 3: Implement ordered safe selection.**

Change `chooseTarget` and `chooseAccessTarget` to build and sort candidates before safety evaluation, then return the first safe candidate. Keep `findUnsafeTarget` as the fallback used only when no safe target exists.

- [ ] **Step 4: Add weak world-identity safety caching.**

Cache `assessDigSafety` results by world identity, stand, target, and the active haul-reservation signature. Include storage inventory in the world identity so deposits naturally invalidate cached route/capacity results.

- [ ] **Step 5: Replace linear block membership checks with a set.**

Export `MINEABLE_BLOCK_SET` from `content.ts` and use it in generation, pathfinding, engine, HUD, and Inspector scans.

- [ ] **Step 6: Run the engine and full simulation tests, then commit.**

Run `PATH=/Users/openclaw/.vite-plus/bin:/opt/homebrew/bin:$PATH npm test -- --run src/game/engine.test.ts src/game/state.test.ts` and then the full suite. Commit with `perf: cache and prune planner safety work`.

### Task 3: Incrementally update terrain instances

**Files:**
- Create: `src/components/terrainPositions.ts`
- Create: `src/components/terrainPositions.test.ts`
- Modify: `src/components/TerrainLayer.tsx`

- [ ] **Step 1: Write failing pure helper tests.**

Test that initial derivation returns all block positions, that an unchanged cell array returns the same position map, and that changing one cell creates new arrays only for the old and new block types while preserving all other block-array identities.

- [ ] **Step 2: Run the helper test and confirm the expected failure.**

Run `PATH=/Users/openclaw/.vite-plus/bin:/opt/homebrew/bin:$PATH npm test -- --run src/components/terrainPositions.test.ts`.

- [ ] **Step 3: Implement initial and incremental position derivation.**

Create a typed position map for mineable blocks and bedrock. On subsequent cell arrays, compare cell object identities, clone only affected block arrays, remove changed coordinates from the old block list, and append them to the new block list.

- [ ] **Step 4: Refactor `TerrainLayer` to use stable position arrays.**

Move cell scanning out of `BlockInstances`, pass position arrays as props, key remounted meshes by block and instance count, and call `computeBoundingSphere()` after matrix updates. Keep unchanged block meshes memoized.

- [ ] **Step 5: Run helper, component-adjacent, and full tests, then commit.**

Run the focused helper test and full suite. Commit with `perf: update terrain instances incrementally`.

### Task 4: Reduce renderer startup and pixel cost

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/WorldCanvas.tsx`

- [ ] **Step 1: Lazy-load the R3F surface.**

Wrap `WorldCanvas` in `React.lazy` and `Suspense` with an accessible loading fallback. Keep the existing world and dwarf props unchanged.

- [ ] **Step 2: Cap DPR safely.**

Change the canvas DPR range from `[1, 2]` to `[1, 1.5]`; retain antialiasing disabled and orthographic controls unchanged.

- [ ] **Step 3: Run typecheck, lint, and build.**

Run `PATH=/Users/openclaw/.vite-plus/bin:/opt/homebrew/bin:$PATH npm run typecheck`, `npm run lint`, and `npm run build`. Confirm the build emits a separate renderer chunk.

- [ ] **Step 4: Commit renderer changes.**

Commit with `perf: defer and constrain world renderer`.

### Task 5: Benchmark and final verification

**Files:**
- Create temporarily: `src/game/performance-investigation.tmp.test.ts`
- Delete: `src/game/performance-investigation.tmp.test.ts`

- [ ] **Step 1: Add a deterministic stress benchmark.**

Measure one tick and twenty steady ticks for 3, 12, and 24 dwarves on the broad-frontier fixture used during investigation. Print JSON timings and task counts.

- [ ] **Step 2: Run the benchmark before and after the final optimizations.**

Run `PATH=/Users/openclaw/.vite-plus/bin:/opt/homebrew/bin:$PATH npm test -- --run --disableConsoleIntercept src/game/performance-investigation.tmp.test.ts` and record the result in the final handoff.

- [ ] **Step 3: Remove the temporary benchmark.**

Delete the temporary test with `apply_patch` and verify it is absent from git status.

- [ ] **Step 4: Run the complete verification suite.**

Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` with the Node 24 runtime path. Report any remaining bundle warning or stress-case limitation explicitly.

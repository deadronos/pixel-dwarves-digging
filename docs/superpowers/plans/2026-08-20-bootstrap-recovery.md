# Bootstrap Safety and Emergency Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add startup-safe mining, material-aware access planning, cut-off self-rescue, and visible deadlock detection to the existing access-first simulation.

**Architecture:** Keep movement and construction on the existing pathfinding graph. Add a small safety state to the simulation, pure logistics helpers for bootstrap protection/material availability/emergency ladder placement, and engine priorities that fail closed when a haul route disappears. Migrate saves from schema 3 to schema 4.

**Tech Stack:** TypeScript, Vitest, Zustand, React, React Three Fiber, Biome.

---

## Task 1: Add safety state and starter constants

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/content.ts`
- Modify: `src/game/state.ts`
- Modify: `src/game/progression.ts`
- Test: `src/game/state.test.ts`

- [ ] Add a failing test asserting a fresh simulation has bootstrap safety, two starter stone blocks, and one emergency stone reserved.
- [ ] Run `npm test -- --run src/game/state.test.ts` and verify the new expectation fails.
- [ ] Add `SafetyPhase`, `SafetyBlockReason`, and `SafetyState` to `src/game/types.ts`; add `safety` to `SimulationState`.
- [ ] Add constants for the bootstrap clear threshold, protected starter radius, starter vein length, starter stone supply, emergency reserve, and maximum open access requests.
- [ ] Initialize safety and starter inventory/storage in `createInitialSimulation`; preserve the values through prestige/new-run creation.
- [ ] Update every typed simulation fixture with the new safety state.
- [ ] Run `npm test -- --run src/game/state.test.ts src/game/progression.test.ts && npm run typecheck` and confirm it passes.
- [ ] Commit with `feat: add colony bootstrap safety state`.

## Task 2: Guarantee starter material and protect the starter foundation

**Files:**
- Modify: `src/game/generation.ts`
- Modify: `src/game/logistics.ts`
- Test: `src/game/generation.test.ts`
- Test: `src/game/logistics.test.ts`

- [ ] Add failing tests asserting generated worlds contain the configured contiguous starter stone vein and bootstrap protection covers cells directly below the starter pocket/stockpile while side cells remain eligible.
- [ ] Run the focused generation/logistics tests and verify the new assertions fail.
- [ ] Carve the starter vein after the starter pocket is created without placing it on bedrock or inside the stockpile footprint.
- [ ] Add `isBootstrapProtectedTarget` and `isBootstrapActive` helpers; use the starter safety state and stockpile geometry to protect only the early downward/foundation cells.
- [ ] Add `getAvailableConstructionMaterial` that excludes the reserved emergency common block from ordinary construction.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `feat: guarantee a safe starter mining loop`.

## Task 3: Make access requests wait for affordable material

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/logistics.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/logistics.test.ts`
- Test: `src/game/engine.test.ts`

- [ ] Add failing tests asserting an unfunded access request remains visible with `waiting-for-stone` and creates no construction order, then becomes actionable once stone is available.
- [ ] Add failing tests asserting a ladder can use a common terrain block, emergency recovery can consume carried common material, and legacy open-request piles are trimmed to the active frontier.
- [ ] Add a failing test asserting more than the configured maximum does not create more open access requests.
- [ ] Run the focused tests and verify the expected failures.
- [ ] Add an optional access-request blocked reason, gate ladders on available non-reserved common material, keep bridges/outposts stone-only, clear the reason when funding becomes possible, and cap/trim request creation after deduplication.
- [ ] Keep access preparation ahead of ordinary mining only when it is safe and actionable; preserve safe work when an access request is waiting for material.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `feat: gate access construction on available materials`.

## Task 4: Add emergency ladder self-rescue

**Files:**
- Modify: `src/game/logistics.ts`
- Modify: `src/game/engine.ts`
- Modify: `src/game/buildings.ts` if a small completed-building helper is needed
- Test: `src/game/engine.test.ts`
- Test: `src/game/logistics.test.ts`

- [ ] Add failing tests for a cut-off dwarf carrying stone or another common block restoring a storage route with one valid anchored ladder, a cut-off dwarf using the emergency reserve, and a cut-off dwarf carrying ore retaining it when no ladder can be placed.
- [ ] Run the focused tests and verify they fail for the missing rescue behavior.
- [ ] Implement a pure emergency-site search that tests candidate ladder cells against `canPlaceBuilding` and a simulated storage route.
- [ ] Implement emergency ladder placement that consumes carried common material first, otherwise one reserved emergency common block, creates a completed ladder only at a valid site, and marks the dwarf grounded with recovery work.
- [ ] Invoke rescue before ordinary recovery idling; leave impossible recovery tasks untouched and prevent new mining assignment.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `feat: let cut-off dwarves restore access`.

## Task 5: Add safety status and deadlock guard

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/logistics.ts`
- Modify: `src/components/Hud.tsx`
- Modify: `src/components/Inspector.tsx`
- Test: `src/game/engine.test.ts`

- [ ] Add failing tests for bootstrap status, operational transition after the starter loop, and blocked status when recovery/access work has no route or material.
- [ ] Run the focused engine tests and verify the status assertions fail.
- [ ] Add a pure colony safety-status calculation and update it after each simulation tick; block further unsafe excavation when all work is either unrecoverable or waiting for stone.
- [ ] Expose the status and reason in the HUD/inspector without changing the renderer's simulation rules.
- [ ] Run focused tests and confirm they pass.
- [ ] Commit with `feat: expose colony deadlock status`.

## Task 6: Migrate saves and update documentation

**Files:**
- Modify: `src/game/serialization.ts`
- Modify: `src/game/serialization.test.ts`
- Modify: `README.md`
- Modify: `idea.md` if present and still current

- [ ] Add failing schema migration tests for schema 3 saves without safety state and round-trip preservation of carried blocks/emergency reserve.
- [ ] Run serialization tests and verify the new migration assertions fail.
- [ ] Bump the save schema to 4, normalize old safety fields, preserve all existing state, and initialize missing starter safety conservatively.
- [ ] Document the bootstrap phase, emergency reserve, and recovery priorities.
- [ ] Run serialization tests and confirm they pass.
- [ ] Commit with `feat: migrate saves for bootstrap recovery`.

## Task 7: Full verification and browser smoke test

**Files:**
- No additional production files unless verification finds a focused defect.

- [ ] Run `npm test -- --run` and record the full passing count.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Start the dev server and smoke-test a fresh run: visible bedrock, starter stone, no early downward excavation, access waiting status, and recovery status.
- [ ] Inspect the final diff and worktree status.
- [ ] Commit any narrowly scoped verification fix, rerun all checks, and report evidence.

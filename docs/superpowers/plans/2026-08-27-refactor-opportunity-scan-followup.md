# Refactor Opportunity Scan Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicated domain logic and decompose the remaining simulation hotspots identified in issue #40 without changing observable simulation, persistence, cache, or facade behavior.

**Architecture:** Keep the existing top-level module APIs stable. Extract pure helpers first, then split expansion diagnostics, engine task advancement, and save validation by responsibility. The `stepSimulation` loop remains the only place that merges per-dwarf `AdvanceResult` values into the sequential simulation state.

**Tech Stack:** TypeScript, Zustand, React, Vitest, Biome, Vite.

---

### Task 1: Establish issue-linked refactor baseline

**Files:**
- Modify: `docs/superpowers/specs/2026-08-27-refactor-opportunity-scan-followup-design.md`
- Create: `docs/superpowers/plans/2026-08-27-refactor-opportunity-scan-followup.md`
- Test: existing suite only

- [ ] **Step 1: Verify the issue and design scope**

Confirm GitHub issue #40 contains the scan findings, constraints, and planned work, and confirm the current branch is `codex/refactor-opportunity-scan-followup-2026-08-27` with `main` untouched.

- [ ] **Step 2: Record the serialized baseline**

Run:

```bash
localstorage_file=$(mktemp /tmp/pixel-dwarves-refactor.XXXXXX)
NODE_OPTIONS="--localstorage-file=$localstorage_file" npm test -- --run --maxWorkers=1
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: 16 test files and 164 tests pass with one worker; typecheck, lint, build, and diff check pass. The build may retain the existing large renderer chunk warning.

- [ ] **Step 3: Commit the design and plan**

```bash
git add docs/superpowers/specs/2026-08-27-refactor-opportunity-scan-followup-design.md docs/superpowers/plans/2026-08-27-refactor-opportunity-scan-followup.md
git commit -m "docs: plan refactor opportunity follow-up"
```

### Task 2: Extract shared storage and world-derived helpers

**Files:**
- Create: `src/game/buildings/storage.ts`
- Modify: `src/game/buildings.ts`, `src/game/logistics/storage.ts`, `src/game/generation.ts`, `src/game/engine.ts`, `src/game/engine/safetyObservation.ts`, `src/components/Hud.tsx`, `src/components/Inspector.tsx`
- Test: `src/game/buildings.test.ts`, `src/game/logistics.test.ts`, `src/game/generation.test.ts`

- [ ] **Step 1: Add a focused storage-helper red test**

Add a direct test for a new `addMaterialToStorage(world, buildingId, material)` helper: it returns a new world with one material added to the addressed completed storage building, returns `null` for a missing/full/non-storage building, and leaves the input world unchanged. Add a `countSolids` assertion if the generation suite does not already cover it.

- [ ] **Step 2: Implement storage ownership**

Move the private `removeFromStorage` implementation into `buildings/storage.ts`, and add:

```ts
export function addMaterialToStorage(
  world: World,
  buildingId: string,
  material: keyof Inventory,
): World | null
```

Use the helper from `returnMaterialToStorage` and `logistics/storage.ts`’s `depositCarriedMaterial`. Preserve first-available selection for return paths, explicit-building selection for deposits, capacity accounting, and immutable world replacement.

- [ ] **Step 3: Add and use the mineable predicate helper**

Add `hasMineableSolids(world: World): boolean` beside `countSolids`, replace the duplicated `MINEABLE_BLOCK_SET` scans in engine safety/completion logic, and use `countSolids` in HUD and Inspector. Keep the existing result for every world.

- [ ] **Step 4: Verify and commit storage helpers**

Run the focused building, logistics, and generation tests plus typecheck. Commit:

```bash
git add src/game/buildings src/game/buildings.ts src/game/logistics/storage.ts src/game/generation.ts src/game/engine.ts src/game/engine/safetyObservation.ts src/components/Hud.tsx src/components/Inspector.tsx
git commit -m "refactor: share storage and world helpers"
```

### Task 3: Deduplicate targeting and path wrappers

**Files:**
- Modify: `src/game/engine/targeting.ts`, `src/game/pathfinding.ts`
- Test: create `src/game/engine/targeting.test.ts`; modify `src/game/pathfinding.test.ts`

- [ ] **Step 1: Add red tests for shared candidate ordering and adjacent directions**

Test a new `rankedWorkCandidates(state, dwarf)` helper using a fixture with a reserved target and bootstrap-protected target; expect only the eligible candidate in score order. Test that adjacent path enumeration preserves cardinal-only versus movement-direction behavior.

- [ ] **Step 2: Extract ranked candidate construction**

Create one internal/exported-for-focused-tests `rankedWorkCandidates` pipeline that builds the reservation set, filters bootstrap targets, maps stand positions and scores, and sorts with the existing tie-break. Make `chooseTarget` and `findUnsafeTarget` consume it and retain their different safety result handling.

- [ ] **Step 3: Extract generic adjacent-path enumeration**

Add a private `findAdjacentPathsForDirections(world, from, target, directions, cleared)` implementation in `pathfinding.ts`; have `findAdjacentPaths` pass cardinal directions and `findAdjacentConstructionPaths` pass movement directions. Preserve path sorting and virtual-cleared-cell forwarding.

- [ ] **Step 4: Unify cell clearing**

Move the immutable target-to-air operation to one world helper and have both `simulateDigWorld` and `engine/tasks.ts` use it. Do not change bounds behavior or cell metadata.

- [ ] **Step 5: Verify and commit**

Run targeting, pathfinding, logistics, and engine tests plus typecheck. Commit:

```bash
git add src/game/engine/targeting.ts src/game/engine/targeting.test.ts src/game/pathfinding.ts src/game/pathfinding.test.ts src/game/engine/tasks.ts
git commit -m "refactor: share targeting and path helpers"
```

### Task 4: Consolidate construction recovery and split expansion modules

**Files:**
- Create: `src/game/logistics/constructionRecovery.ts`, `src/game/logistics/expansionPlanning.ts`, `src/game/logistics/expansionDiagnostics.ts`
- Modify: `src/game/logistics/access.ts`, `src/game/logistics/expansion.ts`, `src/game/logistics.ts`
- Test: `src/game/logistics.test.ts`, create focused tests beside new modules

- [ ] **Step 1: Add red tests for recovered-order cleanup and shared candidate selection**

Test that a recovered planned order returns reserved and delivered materials, removes its planned building/order, and preserves the rest of the state. Test that planner and diagnostics choose the same first placeable/reachable candidate for depot and outpost sites.

- [ ] **Step 2: Extract conservation-safe order cleanup**

Move `returnOrderMaterials` and the common “return material, remove building, remove order” transition into `constructionRecovery.ts`. Keep access orphan/stale predicates and outpost stale predicates in `access.ts`, but make both call the shared transition.

- [ ] **Step 3: Extract expansion planning**

Move `planExpansionOrder`, `planOverflowDepotOrder`, `planStorageUpgradeOrder`, and `planEmergencyCapacityOrder` to `expansionPlanning.ts`. Add shared helpers for first reachable candidate and construction state creation; retain order reasons, IDs, capacity thresholds, policy gates, and material requirements exactly.

- [ ] **Step 4: Extract expansion diagnostics**

Move diagnostic types, cache, key construction, `explainConstructionSites`, `getStorageExpansionDiagnostics`, and `getStorageDiagnostics` to `expansionDiagnostics.ts`. Reuse the shared candidate helper without invoking state-mutating planners. Preserve `WeakMap<World, ...>` identity and all cache-key inputs.

- [ ] **Step 5: Reduce the logistics facade and verify**

Re-export the same public functions/types from the focused modules. Ensure focused logistics modules import siblings directly rather than `../logistics`. Run logistics, engine, serialization, typecheck, and import-direction searches. Commit:

```bash
git add src/game/logistics src/game/logistics.ts
git commit -m "refactor: split expansion and recovery logistics"
```

### Task 5: Split engine task advancement

**Files:**
- Create: `src/game/engine/advancement.ts`, `src/game/engine/idleAdvancement.ts`, `src/game/engine/buildAdvancement.ts`, `src/game/engine/digAdvancement.ts`, `src/game/engine/haulAdvancement.ts`
- Modify: `src/game/engine.ts`, `src/game/engine/tasks.ts`, `src/game/engine/recovery.ts`
- Test: create focused advancement tests; retain `src/game/engine.test.ts` integration coverage

- [ ] **Step 1: Add red tests for task-handler contracts**

Add focused tests for build assignment preserving `constructionOrderId` and purpose, dig completion creating a haul with the safety-selected storage, and haul failure preserving cargo in recovery. Tests must assert observable `AdvanceResult` state, not implementation details.

- [ ] **Step 2: Extract stable task constructors**

Add focused constructors for idle, dig, build, recovery-haul, and ordinary-haul task states. Use them to remove repeated object literals while preserving optional fields and exact task shapes.

- [ ] **Step 3: Extract idle assignment and movement**

Move the idle branch, build-order selection, storage-route recovery setup, and path movement validation into focused handlers. Inject dependencies as function parameters where needed; do not import the `engine.ts` facade from extracted modules.

- [ ] **Step 4: Extract build, dig, and haul completion**

Move each task-kind transition into its module, returning `AdvanceResult`. Keep completion-time placement validation, delivery/reservation decrementing, safety checks, virtual dig clearing, recovery-material consumption, deposits, and emergency recovery unchanged.

- [ ] **Step 5: Reduce `engine.ts` to orchestration**

Keep safety-state derivation, stale-order planning, sequential dwarf iteration, world-revision updates, progress accounting, completion detection, `stepOnce`, and `stepSimulation` in `engine.ts`. Delegate one dwarf advancement through a small dispatcher in `advancement.ts`.

- [ ] **Step 6: Verify and commit**

Run all engine, logistics, pathfinding, and state tests plus typecheck. Confirm the extracted modules do not import `./engine` and commit:

```bash
git add src/game/engine src/game/engine.ts
git commit -m "refactor: split engine task advancement"
```

### Task 6: Decompose serialization validation

**Files:**
- Create: `src/game/serialization/validation/primitives.ts`, `src/game/serialization/validation/entities.ts`, `src/game/serialization/validation/state.ts`
- Modify: `src/game/serialization/validation.ts`, `src/game/serialization/migrations.ts`
- Test: create focused validation tests; retain `src/game/serialization.test.ts`

- [ ] **Step 1: Add red tests for focused validation boundaries**

Test primitive position/inventory rejection, entity task/order rejection, and cross-record rejection of dangling task/building/order/request references. Include the `allowOrphanedAccessOrders` migration-repair case.

- [ ] **Step 2: Move primitive validators and constants**

Move record, integer, position, inventory, cell, storage, and enum predicates into `primitives.ts`. Preserve dimensions and optional-field handling.

- [ ] **Step 3: Move entity validators**

Move building, task, dwarf, construction-order, access-request, and world validation into `entities.ts`, passing width/height explicitly. Preserve all quantity, status, and construction invariants.

- [ ] **Step 4: Move simulation cross-record invariants**

Move `isSimulationState` into `state.ts`, using entity validators and `hasUniqueIds`. Preserve the optional orphaned-access-order mode and every existing boolean condition.

- [ ] **Step 5: Keep the validation facade stable and verify**

Re-export `isRecord`, `isNonNegativeInteger`, `isInventoryRecord`, `isDwarf`, `isConstructionOrder`, `isAccessRequest`, `isWorld`, and `isSimulationState` from `validation.ts`. Change `migrations.ts` to import `recoverOrphanedAccessOrders` from `../logistics/access` instead of the logistics facade. Run serialization/state tests, typecheck, and commit:

```bash
git add src/game/serialization
git commit -m "refactor: split save validation responsibilities"
```

### Task 7: Reorganize tests and document boundaries

**Files:**
- Create: focused tests under `src/game/engine/`, `src/game/logistics/`, and `src/game/serialization/validation/`
- Modify: `src/game/engine.test.ts`, `src/game/logistics.test.ts`, `README.md`

- [ ] **Step 1: Move tests by responsibility without weakening assertions**

Move targeting, recovery, construction, expansion, storage, diagnostics, and validation scenarios into focused files. Keep shared row/world builders in the narrowest fixture module that uses them, and preserve integration scenarios in the top-level tests.

- [ ] **Step 2: Add architecture documentation**

Document that top-level engine, logistics, buildings, pathfinding, and serialization files are stable facades/orchestrators, and list the focused subsystem directories.

- [ ] **Step 3: Verify test organization**

Run the complete serialized suite and confirm test count is no lower than the 164-test baseline. Run Biome and inspect for duplicate facade imports.

### Task 8: Final verification and issue update

**Files:**
- Modify: GitHub issue #40 with implementation checklist and verification results

- [ ] **Step 1: Run the complete verification suite**

```bash
localstorage_file=$(mktemp /tmp/pixel-dwarves-refactor-final.XXXXXX)
NODE_OPTIONS="--localstorage-file=$localstorage_file" npm test -- --run --maxWorkers=1
npm run typecheck
npm run lint
npm run build
git diff --check
```

- [ ] **Step 2: Audit the final diff and dependency direction**

Confirm only issue #40 scope changed, all facades retain their previous exports, focused modules do not import their own facade, caches retain world identity and complete keys, and no save schema or task shape changed.

- [ ] **Step 3: Update issue #40**

Add the implemented module map, verification commands/results, and any remaining non-blocking build warning to the issue. Do not close the issue until all planned tasks and checks are complete.

- [ ] **Step 4: Report the branch state**

Provide the issue URL, branch name, commits, changed module map, test/check results, and any residual caveat. Do not merge or delete the branch without explicit approval.

# Liveness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove four identified deadlock paths while preserving grounded movement, storage reservations, construction anchors, and conservation-safe recovery.

**Architecture:** Keep simulation rules renderer-independent. Add the bootstrap guarantee at world generation, route rescue material through existing logistics/building APIs, track per-dwarf liveness as optional save-compatible state, and broaden only construction approach discovery—not placement or movement safety.

**Tech Stack:** TypeScript, Vitest, Vite, Biome.

---

### Task 1: Reproduce and close the bootstrap-pocket deadlock

**Files:**
- Modify: `src/game/generation.ts`
- Modify: `src/game/generation.test.ts`
- Modify: `src/game/content.ts` only if a named starter-route constant is needed

- [ ] **Step 1: Write the failing seed regression**

Add a test that runs `createInitialSimulation('review-live-0')` for 120 ticks and asserts the run is not permanently blocked with fewer than eight cleared blocks:

```ts
it('keeps the starter frontier reachable after the initial pocket is mined', () => {
  const result = stepSimulation(createInitialSimulation('review-live-0'), 120)

  expect(result.safety.phase).not.toBe('blocked')
  expect(result.totalCleared).toBeGreaterThan(7)
})
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run `npm test -- --run src/game/generation.test.ts -t "keeps the starter frontier reachable"`. It must fail with the current `blocked/no-safe-work` result and six cleared blocks.

- [ ] **Step 3: Add the minimum deterministic starter support**

Update `carveStarterPocket`/starter generation so the pocket has a continuous supported descent into the first mineable row. Prefer a one-cell ladder at the starter shaft or an equivalent supported floor; do not expand the protected pocket or consume inventory. Ensure the generated support is represented as completed world infrastructure so `isSupported` and vertical movement see it.

- [ ] **Step 4: Run the focused test and the generation suite**

Run `npm test -- --run src/game/generation.test.ts -t "starter|bootstrap|frontier"`. The new regression and existing starter guarantees must pass.

### Task 2: Allow stocked common material to rescue a truly stranded dwarf

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/engine.test.ts`
- Modify: `src/game/logistics.test.ts` if the rescue plan needs a direct logistics regression

- [ ] **Step 1: Write the failing stranded-stock test**

Create a supported fixture with a stranded dwarf, `safety.emergencyStone = 0`, and one available common material in inventory. Assert that one simulation step creates an emergency ladder and a recovery haul task.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run `npm test -- --run src/game/engine.test.ts -t "stocked common material"`. It must fail because `attemptEmergencyRecovery` currently rejects recovery when the emergency reserve is zero.

- [ ] **Step 3: Add a separate stock-material recovery path**

In `attemptEmergencyRecovery`, distinguish `usesReserve` from `usesStockMaterial`. Use `chooseCommonConstructionMaterial(state, 1)` when the dwarf is stranded and no carried common material exists. Consume that material only after `findEmergencyLadderPlan` returns a valid route, and never decrement `emergencyStone` for this path.

- [ ] **Step 4: Run focused recovery tests**

Run `npm test -- --run src/game/engine.test.ts -t "stranded|recovery|rescue"`. Existing reserve and carried-material behavior must remain green.

### Task 3: Track per-dwarf liveness and expose recovery stalls

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/serialization.ts`
- Modify: `src/game/engine.ts`
- Modify: `src/game/engine.test.ts`
- Modify: `src/game/serialization.test.ts`
- Modify: `src/game/content.ts` if a named dwarf liveness limit is needed

- [ ] **Step 1: Write failing per-dwarf liveness tests**

Add one test where dwarf A is in a stalled recovery/stranded state while dwarf B has active dig work; after the liveness limit, assert the safety state reports `awaiting-recovery` rather than remaining operational. Add a serialization test proving a saved `noProgressTicks` value round-trips and an old dwarf without the optional field remains valid.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run `npm test -- --run src/game/engine.test.ts src/game/serialization.test.ts -t "per-dwarf|liveness|noProgressTicks"`. The tests must fail before the field and safety logic exist.

- [ ] **Step 3: Add optional save-compatible dwarf progress state**

Add `noProgressTicks?: number` to `DwarfState`. Validate it as a non-negative integer when present, while accepting older saves without the field.

- [ ] **Step 4: Update counters from actual progress**

In `stepOnce`, compare each dwarf’s `AdvanceResult.progressed` and task/movement state. Reset the counter on actual progress; increment it on unchanged recovery/stranded ticks. Assignment alone must not count as progress.

- [ ] **Step 5: Include stalled recovery in safety evaluation**

Treat a dwarf at `NO_PROGRESS_TICK_LIMIT` with recovery purpose or stranded movement as `awaiting-recovery` even if another dwarf is mining. Do not block ordinary productive work; the phase is a safety signal and recovery planning remains active.

- [ ] **Step 6: Run engine and serialization tests**

Run `npm test -- --run src/game/engine.test.ts src/game/serialization.test.ts`. Confirm existing colony-wide watchdog and save migration tests remain green.

### Task 4: Permit diagonal construction approaches

**Files:**
- Modify: `src/game/pathfinding.ts`
- Modify: `src/game/pathfinding.test.ts`
- Modify: `src/game/logistics.test.ts`
- Modify: `src/game/engine.test.ts` if builder execution needs an integration regression

- [ ] **Step 1: Write the failing diagonal builder-route test**

Create a fixture where a planned ladder/depot has a reachable diagonal stand but no reachable cardinal stand. Assert `findAdjacentPaths` returns the diagonal route and the construction planner does not mark the request `no-builder-route`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run `npm test -- --run src/game/pathfinding.test.ts src/game/logistics.test.ts -t "diagonal.*build|diagonal.*construction"`. It must fail because `findAdjacentPaths` currently enumerates only four stands.

- [ ] **Step 3: Extend stand enumeration without weakening movement**

Have `findAdjacentPaths` enumerate all eight neighboring stands, call the existing `findPath`, and preserve path-length ordering. Do not change `canMoveBetween`, corner clearance, anchors, or footprint validation.

- [ ] **Step 4: Run focused pathfinding/logistics tests**

Run `npm test -- --run src/game/pathfinding.test.ts src/game/logistics.test.ts`. Confirm cardinal routes and diagonal corner-blocked routes retain their existing behavior.

### Task 5: Add the deterministic liveness sweep and verify the whole change

**Files:**
- Modify: `src/game/generation.test.ts`
- Modify: `src/game/engine.test.ts`
- Modify: `src/game/pathfinding.test.ts`
- Modify: `src/game/logistics.test.ts`

- [ ] **Step 1: Add a compact deterministic sweep regression**

Run the 200 `review-live-*` seeds for 120 ticks in a test and assert none ends with `blocked`, `noProgressTicks > 20`, and remaining mineable solids. Keep the assertion diagnostic by including the seed and safety state in the failure message.

- [ ] **Step 2: Run the sweep and all game tests**

Run `npm test -- --run src/game/generation.test.ts src/game/engine.test.ts src/game/pathfinding.test.ts src/game/logistics.test.ts src/game/serialization.test.ts` and confirm zero failures.

- [ ] **Step 3: Run complete verification**

Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

- [ ] **Step 4: Inspect the final diff and branch state**

Run `git diff --stat`, `git diff --check`, and `git status --short`. Confirm only the approved simulation, test, and design/plan documentation files changed.

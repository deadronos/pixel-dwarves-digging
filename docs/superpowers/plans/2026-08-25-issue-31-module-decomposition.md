# Issue #31 Module Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `engine.ts`, `logistics.ts`, and `serialization.ts` into focused modules while preserving simulation behavior, cache semantics, save shape, and public imports.

**Architecture:** Extract pure domain responsibilities into `engine/`, `logistics/`, and `serialization/` submodules. Keep the existing top-level files as thin orchestration/facade surfaces so current consumers continue importing the same APIs. Move code in dependency order from low-level helpers toward orchestration, using the existing tests as behavior locks.

**Tech Stack:** TypeScript, Vitest, Biome, Vite, Git worktree, GitHub CLI.

---

### Task 1: Establish the verified baseline and dependency rules

**Files:**
- Modify: no production files
- Test: existing suite only

- [ ] **Step 1: Record the clean baseline**

Run:

```bash
npm test -- --run
npm run lint
npm run build
```

Expected: 155 tests pass, lint passes, and the production build completes.

- [ ] **Step 2: Confirm the top-level module boundaries before extraction**

Do not create empty directories because Git does not track them. Confirm the current top-level modules still compile before extraction:

```bash
npm test -- --run
```

No commit is required for this baseline-only task; the approved design and implementation-plan commits already record the intended boundaries.

### Task 2: Extract logistics subsystems behind the existing facade

**Files:**
- Create: `src/game/logistics/storage.ts`
- Create: `src/game/logistics/access.ts`
- Create: `src/game/logistics/safety.ts`
- Create: `src/game/logistics/expansion.ts`
- Modify: `src/game/logistics.ts`
- Test: `src/game/logistics.test.ts`, focused logistics tests as needed

- [ ] **Step 1: Add facade-level smoke assertions before moving code**

Extend the existing logistics tests with a public-import smoke test that calls representative APIs through `./logistics`:

```ts
it('keeps the logistics facade public API intact', () => {
  const state = makeStorageState()
  expect(getAvailableCapacity(state.world)).toBe(120)
  expect(getStorageDiagnostics(state).buildings).toHaveLength(1)
  expect(assessDigSafety(state, { x: 1, y: 1 }, { x: 2, y: 1 }).safe).toBeTypeOf('boolean')
})
```

- [ ] **Step 2: Move storage ownership first**

Move storage discovery, material availability, aggregate inventory, capacity helpers, reachability-to-storage, destination selection, and deposit behavior into `logistics/storage.ts`. Export only the helpers needed by sibling modules and the facade. Keep implementations unchanged apart from import paths.

- [ ] **Step 3: Run logistics tests and typecheck**

```bash
npx vitest run src/game/logistics.test.ts
npx tsc -b
```

Expected: the focused suite passes and no type errors occur.

- [ ] **Step 4: Move access planning and recovery ownership**

Move emergency ladder planning, access construction-order planning, and stale/orphaned order recovery into `logistics/access.ts`. Import storage helpers from `logistics/storage.ts`; do not import the top-level facade.

- [ ] **Step 5: Move safety ownership**

Move dig-safety cache/key evaluation, support/drop checks, and `assessDigSafety` into `logistics/safety.ts`. Preserve the `WeakMap<World, ...>` cache and its exact key inputs.

- [ ] **Step 6: Move expansion and diagnostics ownership**

Move expansion order planners, diagnostic types, diagnostic calculation, and storage-expansion cache into `logistics/expansion.ts`. Import storage/access helpers directly from focused modules. Keep the cache keyed by `World` identity and preserve `getStorageExpansionDiagnostics` referential reuse.

- [ ] **Step 7: Reduce the facade to re-exports and verify**

Make `src/game/logistics.ts` re-export the public functions/types from the four focused modules. Verify no focused logistics module imports `./logistics`:

```bash
rg -n "from ['\"]\.\/logistics['\"]" src/game/logistics
npx vitest run src/game/logistics.test.ts src/game/engine.test.ts
```

Expected: no circular facade imports and all logistics/engine tests pass.

- [ ] **Step 8: Commit logistics extraction**

```bash
git add src/game/logistics.ts src/game/logistics/
git commit -m "refactor: split logistics responsibilities"
```

### Task 3: Extract engine targeting, access requests, and recovery

**Files:**
- Create: `src/game/engine/targeting.ts`
- Create: `src/game/engine/accessRequests.ts`
- Create: `src/game/engine/recovery.ts`
- Create: `src/game/engine/tasks.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/engine.test.ts`, focused engine tests as needed

- [ ] **Step 1: Add regression coverage for extracted public behavior**

Before moving implementations, add focused tests for target tie-breaking and access-request reopening using the existing state fixtures. The assertions must use observable `SimulationState` results, not private helper names.

- [ ] **Step 2: Extract targeting**

Move `distance`, target keys, reachable-work cache, candidate scoring/comparison, work-target selection, unsafe-target selection, and access-target selection into `engine/targeting.ts`. Export a narrow API consumed by the access-request planner and task orchestrator.

- [ ] **Step 3: Run targeting-related regressions**

```bash
npx vitest run src/game/engine.test.ts -t "target|access|task"
```

Expected: all matching tests pass.

- [ ] **Step 4: Extract access-request lifecycle**

Move access-request resolution, reopening, trimming, and `planAccessRequests` into `engine/accessRequests.ts`. Inject or import targeting and logistics APIs directly; do not import `engine.ts`.

- [ ] **Step 5: Extract recovery and task helpers**

Move safety transitions, recovery task construction, emergency recovery, path/task validation, task invalidation, and task advancement helpers into `engine/recovery.ts` and `engine/tasks.ts`. Keep `AdvanceResult` and related types close to the task implementation, exporting only the shape required by the orchestrator.

- [ ] **Step 6: Reduce `engine.ts` to orchestration**

Keep tick setup, the dwarf loop, world-revision bookkeeping, completion checks, and `stepSimulation` in `engine.ts`. Replace moved private implementations with direct imports and preserve call order.

- [ ] **Step 7: Verify engine behavior and module direction**

```bash
npx vitest run src/game/engine.test.ts src/game/logistics.test.ts
npx tsc -b
rg -n "from ['\"]\.\/engine['\"]" src/game/engine
```

Expected: tests and typecheck pass; extracted engine modules do not import the orchestrator.

- [ ] **Step 8: Commit engine extraction**

```bash
git add src/game/engine.ts src/game/engine/
git commit -m "refactor: split engine planning and recovery"
```

### Task 4: Extract serialization validation and migrations

**Files:**
- Create: `src/game/serialization/validation.ts`
- Create: `src/game/serialization/migrations.ts`
- Modify: `src/game/serialization.ts`
- Test: `src/game/serialization.test.ts`, focused serialization tests as needed

- [ ] **Step 1: Add round-trip and migration behavior locks**

Extend serialization tests to assert that a representative current save round-trips byte-meaningfully as state data, schema version remains `4`, and v1/v2/v3 migration outcomes remain unchanged.

- [ ] **Step 2: Extract validation**

Move primitive predicates and structural validators into `serialization/validation.ts`. Pass dimensions or other context explicitly instead of importing the parser module.

- [ ] **Step 3: Run validation tests**

```bash
npx vitest run src/game/serialization.test.ts
```

Expected: all serialization tests pass.

- [ ] **Step 4: Extract migrations and normalization**

Move safety normalization, v1 migration, v3 normalization, generated stockpile repair, and access-order recovery coordination into `serialization/migrations.ts`. Keep migration return types compatible with `SaveParseResult`.

- [ ] **Step 5: Reduce serialization facade**

Keep `SAVE_VERSION`, `SaveParseResult`, `serializeState`, and `parseSave` in `serialization.ts`; delegate validation and migration decisions to the focused modules. Preserve exact error strings unless a test proves an existing string is not contractual.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run src/game/serialization.test.ts src/game/state.test.ts
npx tsc -b
git add src/game/serialization.ts src/game/serialization/
git commit -m "refactor: split save validation and migrations"
```

### Task 5: Document boundaries and add focused module coverage

**Files:**
- Modify: `README.md`
- Create or modify: focused tests beside extracted modules where coverage is currently indirect

- [ ] **Step 1: Add architecture documentation**

Update the README architecture section to state that `engine.ts`, `logistics.ts`, and `serialization.ts` are orchestration/facade surfaces, and list the focused subsystem directories without documenting private helper names.

- [ ] **Step 2: Add focused pure-boundary tests**

Add tests for the highest-value extracted boundaries: target ordering, access-request lifecycle, recovery state transitions, storage capacity/material decisions, safety cache reuse, diagnostic cache reuse, validation rejection, and migration selection.

- [ ] **Step 3: Run the complete suite**

```bash
npm test -- --run
```

Expected: all tests pass with no changed save schema or deterministic behavior.

- [ ] **Step 4: Commit documentation and focused tests**

```bash
git add README.md src/game/engine src/game/logistics src/game/serialization
git commit -m "docs: describe simulation module boundaries"
```

### Task 6: Final verification and PR preparation

**Files:**
- No production changes expected unless verification exposes a regression.

- [ ] **Step 1: Run all required checks**

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

- [ ] **Step 2: Inspect the final diff and dependency graph**

```bash
git status --short
git diff --stat origin/main...HEAD
rg -n "from ['\"]\.\/(engine|logistics|serialization)['\"]" src/game/engine src/game/logistics src/game/serialization
```

Confirm the top-level facades are thin, no extracted module imports its facade, and no unrelated files changed.

- [ ] **Step 3: Create the PR**

```bash
git push -u origin codex/issue-31-module-decomposition
GH_PROMPT_DISABLED=1 GIT_TERMINAL_PROMPT=0 gh pr create --base main --head codex/issue-31-module-decomposition --title "[codex] Decompose simulation concentration points" --body-file /tmp/issue-31-pr-body.md
```

The PR body must explain that issue #31 identified growing engine/logistics/serialization concentration points, describe the compatibility-facade extraction, state that save schema and simulation behavior are unchanged, and list all verification commands and results. Include `Closes #31`.

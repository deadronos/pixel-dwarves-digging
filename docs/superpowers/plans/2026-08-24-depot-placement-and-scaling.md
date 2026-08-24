# Depot Placement and Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make overflow depots placeable on any reachable storage perimeter cell and allow a bounded second depot when the expanded storage network fills again.

**Architecture:** Keep depot planning in `src/game/logistics.ts`. Extract deterministic perimeter enumeration and completed-capacity accounting into small local helpers; `planOverflowDepotOrder` will continue to own trigger, material, reachability, and pending-order checks. Extend `src/game/logistics.test.ts` with fixtures that exercise the public planner rather than implementation details.

**Tech Stack:** TypeScript, Vitest, existing world/building placement and pathfinding helpers.

---

### Task 1: Add the alternate-perimeter regression test

**Files:**
- Modify: `src/game/logistics.test.ts` near the existing `plans a reachable overflow depot` test
- Test: `src/game/logistics.test.ts`

- [ ] **Step 1: Write the failing test**

Create a completed `3x2` stockpile fixture with low available capacity and four available stone. Block the four currently sampled anchor positions, leave a different perimeter cell valid, and assert that `planOverflowDepotOrder` creates a depot at that alternate cell.

The test must use the public planner and assert both `type: 'depot'` and the chosen position. Keep the fixture reachable from the existing dwarf or stockpile and give the candidate valid support so failure is specifically caused by incomplete perimeter enumeration.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- --run src/game/logistics.test.ts -t "plans an overflow depot on an alternate perimeter cell"
```

Expected: FAIL because the current planner checks only four positions anchored at the stockpile origin.

### Task 2: Implement full deterministic perimeter enumeration

**Files:**
- Modify: `src/game/logistics.ts` near `storageBuildings` and `planOverflowDepotOrder`
- Test: `src/game/logistics.test.ts`

- [ ] **Step 1: Add the perimeter helper**

Add a helper with this shape:

```ts
function storagePerimeterCandidates(
  building: Pick<BuildingState, 'position' | 'width' | 'height'>,
): Position[] {
  const candidates: Position[] = []
  for (let x = building.position.x; x < building.position.x + building.width; x += 1) {
    candidates.push(
      { x, y: building.position.y - 1 },
      { x, y: building.position.y + building.height },
    )
  }
  for (let y = building.position.y; y < building.position.y + building.height; y += 1) {
    candidates.push(
      { x: building.position.x - 1, y },
      { x: building.position.x + building.width, y },
    )
  }
  return candidates.filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) => other.x === candidate.x && other.y === candidate.y,
      ) === index,
  )
}
```

Use the existing building metadata and keep the order stable: top/bottom edge cells from left to right, then left/right edge cells from top to bottom.

- [ ] **Step 2: Use the helper in the planner**

Replace the four hard-coded candidates in `planOverflowDepotOrder` with:

```ts
const candidates = storage.flatMap(storagePerimeterCandidates)
```

Keep `canPlaceBuilding` and `hasReachableConstructionSite` checks unchanged.

- [ ] **Step 3: Run the focused test to verify it passes**

Run:

```bash
npm test -- --run src/game/logistics.test.ts -t "plans an overflow depot on an alternate perimeter cell"
```

Expected: PASS.

- [ ] **Step 4: Commit the placement change**

```bash
git add src/game/logistics.ts src/game/logistics.test.ts
git commit -m "fix: search the full storage perimeter for depots"
```

### Task 3: Add failing multi-depot policy tests

**Files:**
- Modify: `src/game/logistics.test.ts` after the existing overflow depot tests
- Test: `src/game/logistics.test.ts`

- [ ] **Step 1: Add the second-depot test**

Start from the storage fixture with the first depot completed and the combined storage nearly full. Put four unreserved stone in `state.inventory`, leave a reachable perimeter cell around the depot or stockpile, call `planOverflowDepotOrder`, and assert that exactly one new `depot` order is added.

- [ ] **Step 2: Add the capacity-limit test**

Use a completed `3x2` stockpile and two completed `1x1` depots with total storage nearly full. Assert that `planOverflowDepotOrder` does not add a third depot. This represents `ceil(total completed storage capacity / completed base stockpile capacity) === 2`.

- [ ] **Step 3: Add the pending-order test**

Keep one completed depot plus one planned depot order, make storage nearly full, and assert that the planner leaves the order list unchanged.

- [ ] **Step 4: Run the new tests to verify they fail**

Run:

```bash
npm test -- --run src/game/logistics.test.ts -t "second overflow depot|capacity-based depot limit|pending depot"
```

Expected: FAIL because the current implementation rejects any colony that already has a depot.

### Task 4: Implement bounded depot scaling

**Files:**
- Modify: `src/game/logistics.ts`
- Test: `src/game/logistics.test.ts`

- [ ] **Step 1: Add completed-capacity helpers**

Add helpers that sum only completed storage buildings:

```ts
function completedBaseStockpileCapacity(world: World): number {
  return world.buildings
    .filter(
      (building) =>
        building.type === 'stockpile' && building.construction === 'completed',
    )
    .reduce((total, building) => total + (building.storage?.capacity ?? 0), 0)
}

function completedStorageCapacity(world: World): number {
  return storageBuildings(world).reduce(
    (total, building) => total + (building.storage?.capacity ?? 0),
    0,
  )
}
```

Add a helper that returns `false` when base stockpile capacity is zero and otherwise compares the completed depot count with:

```ts
Math.ceil(completedStorageCapacity(world) / baseCapacity)
```

- [ ] **Step 2: Replace the single-depot guard**

In `planOverflowDepotOrder`, keep the pending depot-order guard, but replace the completed-depot boolean guard with the capacity-limit helper. This permits a second depot only after the first completed depot increases total capacity, and refuses further depots while the bound remains two.

- [ ] **Step 3: Run the focused suite**

Run:

```bash
npm test -- --run src/game/logistics.test.ts
```

Expected: all logistics tests pass, including the new perimeter and scaling regressions.

- [ ] **Step 4: Commit the scaling change**

```bash
git add src/game/logistics.ts src/game/logistics.test.ts
git commit -m "feat: allow bounded overflow depot scaling"
```

### Task 5: Full verification and PR update

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-depot-placement-and-scaling.md` only to mark completed steps

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --run
```

Expected: zero failures.

- [ ] **Step 2: Run static checks and build**

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit successfully. The existing large-bundle warning is acceptable if unchanged.

- [ ] **Step 3: Inspect the final diff and branch state**

```bash
git diff origin/main...HEAD --stat
git status --short --branch
```

Confirm only the intended logistics code, tests, spec, and plan changed, and no temporary files remain.

- [ ] **Step 4: Push the commits to the existing PR branch**

```bash
git push
gh pr view 22 --json number,state,isDraft,headRefName,baseRefName,url
```

Expected: PR #22 remains open, draft, based on `main`, and points to the updated branch.

# Pixel Dwarves Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce planner and render-loop stalls caused by increased dwarf count, faster travel, and 2x/4x simulation speed without changing game behavior.

**Architecture:** Replace per-target pathfinding with one reachable-work breadth-first traversal per dwarf position, preserve terrain object identity during movement-only ticks, and update dwarf arrays by index. Memoize terrain and DOM derivations so R3F terrain rebuilds only after cell changes.

**Tech Stack:** TypeScript 7, React 19, React Three Fiber, Zustand, Vitest, Vite, Playwright CLI.

---

## File map

- Modify `src/game/pathfinding.ts`: efficient queue traversal and reachable exposed-target API.
- Modify `src/game/pathfinding.test.ts`: shortest-path and exposed-target regression coverage.
- Modify `src/game/engine.ts`: use the shared traversal, preserve world identity, and update dwarves by index.
- Modify `src/game/engine.test.ts`: planner reservation and world-reference behavior.
- Modify `src/components/TerrainLayer.tsx`: memoize terrain components and retain block-derived positions across movement ticks.
- Modify `src/components/Hud.tsx`: memoize remaining-block derivation.
- Modify `src/components/Inspector.tsx`: memoize remaining-block derivation.
- Create temporary `src/game/performance-investigation.test.ts` only during profiling; delete it before final validation.
- Update issue #3 with final measurements and any remaining bottleneck.

### Task 1: Add a single-traversal reachable-work API

**Files:** `src/game/pathfinding.test.ts`, `src/game/pathfinding.ts`

- [ ] **Step 1: Write the failing reachable-work tests.**

Add an import for `findReachableExposedSolids` and tests that assert one shortest path is returned for an exposed target and that duplicate exposure from multiple adjacent air cells produces one target. Use the existing `makeWorld` fixture:

```ts
it('returns exposed solids with shortest paths to a standing cell', () => {
  const world = makeWorld(['......', '..d...', '......'])

  expect(findReachableExposedSolids(world, { x: 1, y: 1 })).toContainEqual({
    target: { x: 2, y: 1 },
    path: [],
  })
})

it('does not return the same exposed solid more than once', () => {
  const world = makeWorld(['.....', '.ddd.', '.d.d.', '.....'])
  const targets = findReachableExposedSolids(world, { x: 2, y: 3 })
  const keys = targets.map(({ target }) => `${target.x}:${target.y}`)

  expect(new Set(keys).size).toBe(keys.length)
})
```

- [ ] **Step 2: Run the focused tests and verify the expected failure.**

Run `npm test -- --run src/game/pathfinding.test.ts`. Expected: TypeScript/Vitest fails because `findReachableExposedSolids` is not exported.

- [ ] **Step 3: Implement one numeric BFS traversal.**

Add:

```ts
export type ReachableExposedSolid = { target: Position; path: Position[] }

export function findReachableExposedSolids(
  world: World,
  from: Position,
): ReachableExposedSolid[] {
  // Queue cell indices with a head cursor; visit each walkable cell once.
  // Record predecessor indices and expose each adjacent solid once.
  // Reconstruct the path only when an exposed target is first discovered.
}
```

Use `Int32Array` distance/predecessor buffers sized to `world.width * world.height`, `indexFor` for numeric keys, and a queue head index instead of `Array.shift()`. Preserve the existing path convention: the path contains walkable cells after `from`, ending at the standing cell beside the solid target.

- [ ] **Step 4: Refactor `findPath` to use the same queue discipline.**

Keep the public `findPath(world, from, to)` signature and current null/empty-path behavior. Replace string-keyed queue traversal with numeric indices and a head cursor, then reconstruct the path from predecessors.

- [ ] **Step 5: Run the focused tests.**

Run `npm test -- --run src/game/pathfinding.test.ts`. Expected: all pathfinding tests pass.

- [ ] **Step 6: Commit the pathfinding unit.**

```bash
git add src/game/pathfinding.ts src/game/pathfinding.test.ts
git commit -m "perf: share reachable-work pathfinding traversal"
```

### Task 2: Integrate the planner and remove quadratic state updates

**Files:** `src/game/engine.test.ts`, `src/game/engine.ts`

- [ ] **Step 1: Write the failing engine identity test.**

Add:

```ts
it('preserves the world reference during movement-only ticks', () => {
  const initial = makeState(['........', '.....d..', '........'])
  const assigned = stepSimulation(initial, 1)
  const moved = stepSimulation(assigned, 1)

  expect(moved.world).toBe(assigned.world)
  expect(moved.world.cells).toBe(assigned.world.cells)
})
```

- [ ] **Step 2: Write the failing reservation test.**

Create a two-dwarf state with two adjacent solids and assert that one tick assigns different targets. The second dwarf must inspect the first dwarf’s assignment through the copied dwarf array, preserving the existing reservation rule.

- [ ] **Step 3: Run the focused engine tests and verify failure.**

Run `npm test -- --run src/game/engine.test.ts`. Expected: the world-reference assertion fails because `stepOnce` currently clones `world.cells` every tick.

- [ ] **Step 4: Replace `chooseTarget` candidate path calls.**

Import `findReachableExposedSolids`, keep the existing reserved-target set and score formula, and select from its `{ target, path }` results:

```ts
const candidates = findReachableExposedSolids(state.world, dwarf.position)
  .filter(({ target }) => !reserved.has(taskKey(target)))
  .map(({ target, path }) => ({
    target,
    path,
    score: scoreTarget(state, target, path.length),
  }))
  .sort(compareCandidates)
```

Extract only the existing score/comparison logic; do not change policy weights.

- [ ] **Step 5: Preserve world identity for non-mining ticks.**

Initialize `nextState.world` with `state.world`, `nextState.dwarves` with `state.dwarves.slice()`, and process dwarves by index. Replace `find` plus `map` with:

```ts
for (let index = 0; index < state.dwarves.length; index += 1) {
  const before = nextState.dwarves[index]
  const after = advanceDwarf(nextState, before)
  nextState.dwarves[index] = after
}
```

When a block is mined, create the cleared world once, use it for the haul path, assign it to `nextState.world`, and do not map the cell array again in the inventory-update branch. Movement-only ticks must retain the original world and cell-array references.

- [ ] **Step 6: Run focused engine and full simulation tests.**

Run `npm test -- --run src/game/engine.test.ts src/game/state.test.ts`. Expected: all tests pass, including the new identity and reservation tests.

- [ ] **Step 7: Commit the engine unit.**

```bash
git add src/game/engine.ts src/game/engine.test.ts
git commit -m "perf: reduce planner and dwarf state update work"
```

### Task 3: Stop terrain and DOM derivations from rebuilding on movement

**Files:** `src/components/TerrainLayer.tsx`, `src/components/Hud.tsx`, `src/components/Inspector.tsx`

- [ ] **Step 1: Add stable memoization without changing rendered output.**

Wrap `BlockInstances` and `TerrainLayer` with `memo`. Use `useMemo` for `remaining` in Hud and Inspector keyed by `simulation.world.cells`:

```ts
const remaining = useMemo(
  () => simulation.world.cells.filter((cell) => cell.block !== 'air').length,
  [simulation.world.cells],
)
```

Keep all labels, controls, colors, and displayed values unchanged.

- [ ] **Step 2: Run typecheck and the existing tests.**

Run `npm run typecheck && npm test -- --run`. Expected: both pass.

- [ ] **Step 3: Commit the rendering boundary unit.**

```bash
git add src/components/TerrainLayer.tsx src/components/Hud.tsx src/components/Inspector.tsx
git commit -m "perf: memoize terrain and colony summaries"
```

### Task 4: Re-profile the optimized engine

**Files:** temporary `src/game/performance-investigation.test.ts`

- [ ] **Step 1: Add the temporary benchmark.**

Use `createInitialSimulation('perf-issue-3', 1, upgrades)` and `stepSimulation` to measure initial assignment for 3/6/12/24 dwarves, 1-tick and 4-tick steady windows, and 20/40-tick windows for move speeds 0/1/2. Print compact JSON summaries only.

- [ ] **Step 2: Run the benchmark and record output.**

Run `npm test -- --run --disableConsoleIntercept src/game/performance-investigation.test.ts`. Compare the measurements to issue #3’s baseline: 375/733/1458/2957 ms initial assignment and 511/615/739 ms for move speeds 0/1/2 over 20 ticks.

- [ ] **Step 3: Delete the temporary benchmark.**

Remove `src/game/performance-investigation.test.ts` with `apply_patch`. It must not remain in the final branch.

### Task 5: Validate the browser and finish issue documentation

- [ ] **Step 1: Run full repository validation.**

Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. Expected: all commands exit 0; the build may retain the existing large-chunk warning.

- [ ] **Step 2: Run the browser profile.**

Start `npm run dev -- --host 127.0.0.1`, open the local URL with Playwright CLI, and collect `PerformanceObserver` long-task and animation-frame samples in paused, 1x, and 4x states. Load the controlled 24-dwarf/move-speed-2 state through the development module as in issue #3, then profile the combined case.

- [ ] **Step 3: Check acceptance metrics.**

Record whether initial assignment is below 100 ms, whether the controlled 4x case has no long task above 50 ms, and whether simulation work remains below 25 ms per 100 ms interval. If any target misses, identify the remaining hotspot rather than claiming completion.

- [ ] **Step 4: Update issue #3.**

Post the before/after tables, browser measurements, files changed, validation results, and any unmet target to `https://github.com/deadronos/pixel-dwarves-digging/issues/3`.

- [ ] **Step 5: Commit any final documentation changes and verify the working tree.**

```bash
git status --short --branch
git diff --check
```

Expected: the branch contains only the intentional implementation/spec/plan commits and no generated profiling artifacts.

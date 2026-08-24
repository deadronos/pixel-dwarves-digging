# Support-Chain Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the simulator recover support-chain deadlocks through anchored access construction, safe diagonal stair-step mining, and bounded emergency drops without weakening storage or grounded-navigation safety.

**Architecture:** Keep movement geometry in `pathfinding.ts`, construction anchoring and emergency-drop route evaluation in `logistics.ts`/`buildings.ts`, and task assignment/execution in `engine.ts`. The existing `DigSafety` result will carry an optional bounded recovery landing and virtual recovery world so ordinary mining remains unchanged while support-breaking digs use the same storage-return pipeline.

**Tech Stack:** TypeScript, Vitest, existing BFS pathfinding, immutable `SimulationState`, Vitest/jsdom test environment.

---

### Task 1: Add eight-direction navigation primitives

**Files:**
- Modify: `src/game/pathfinding.ts`
- Modify: `src/game/pathfinding.test.ts`

- [x] **Step 1: Add failing pathfinding tests**

Extend the existing `makeWorld` fixture with tests for a diagonal route and corner blocking:

```ts
it('finds a supported diagonal path', () => {
  const world = makeWorld(['#####', '.....', '.....', '#####'])
  world.buildings = [
    { id: 'bridge-1', type: 'bridge', position: { x: 1, y: 1 }, width: 1, height: 1, level: 1, construction: 'completed' },
    { id: 'bridge-2', type: 'bridge', position: { x: 2, y: 1 }, width: 1, height: 1, level: 1, construction: 'completed' },
    { id: 'bridge-3', type: 'bridge', position: { x: 1, y: 2 }, width: 1, height: 1, level: 1, construction: 'completed' },
    { id: 'bridge-4', type: 'bridge', position: { x: 2, y: 2 }, width: 1, height: 1, level: 1, construction: 'completed' },
  ]

  expect(findPath(world, { x: 1, y: 1 }, { x: 2, y: 2 })).toEqual([
    { x: 2, y: 2 },
  ])
})

it('does not move diagonally through a blocked corner', () => {
  const world = makeWorld(['#####', '#.#.#', '##..#', '#####'])

  expect(findPath(world, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull()
})

it('discovers a diagonally exposed solid target', () => {
  const world = makeWorld(['#####', '.....', '.....', '...d.', '#####'])
  world.buildings = [
    { id: 'bridge-1', type: 'bridge', position: { x: 1, y: 1 }, width: 1, height: 1, level: 1, construction: 'completed' },
    { id: 'bridge-2', type: 'bridge', position: { x: 2, y: 1 }, width: 1, height: 1, level: 1, construction: 'completed' },
    { id: 'bridge-3', type: 'bridge', position: { x: 1, y: 2 }, width: 1, height: 1, level: 1, construction: 'completed' },
    { id: 'bridge-4', type: 'bridge', position: { x: 2, y: 2 }, width: 1, height: 1, level: 1, construction: 'completed' },
  ]

  expect(findReachableExposedSolids(world, { x: 1, y: 1 })).toContainEqual({
    target: { x: 3, y: 3 },
    path: [{ x: 2, y: 2 }],
  })
})
```

- [x] **Step 2: Run the new tests and observe the red state**

Run `npm test -- --run src/game/pathfinding.test.ts -t "diagonal"`.

Expected: the diagonal path and exposed-target tests fail because the current search only expands the four cardinal directions.

- [x] **Step 3: Separate cardinal and movement directions**

In `src/game/pathfinding.ts`, replace the single direction constant with:

```ts
const CARDINAL_DIRECTIONS: Position[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
]

const MOVEMENT_DIRECTIONS: Position[] = [
  ...CARDINAL_DIRECTIONS,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
]
```

Use `MOVEMENT_DIRECTIONS` in BFS expansion. For a diagonal transition, require both adjacent cardinal side cells to be walkable before accepting the destination. Keep the existing ladder requirement for purely vertical movement.

- [x] **Step 4: Include diagonal mining targets without changing construction adjacency**

Use `MOVEMENT_DIRECTIONS` for exposed-solid target offsets while retaining the reconstructed path to the standing cell. Keep `findAdjacentPaths` on `CARDINAL_DIRECTIONS`; builders may approach a cardinal construction stand diagonally, but a building footprint must not gain diagonal construction semantics.

- [x] **Step 5: Run pathfinding tests and commit**

Run `npm test -- --run src/game/pathfinding.test.ts`; all existing cardinal, ladder, exposed-solid, diagonal, and corner tests must pass. Commit with:

```bash
git add src/game/pathfinding.ts src/game/pathfinding.test.ts
git commit -m "feat: add guarded diagonal navigation"
```

---

### Task 2: Make recovery ladders legal and plan access while blocked

**Files:**
- Modify: `src/game/buildings.ts`
- Modify: `src/game/engine.ts`
- Modify: `src/game/engine.test.ts`
- Modify: `src/game/logistics.test.ts`

- [x] **Step 1: Add failing ladder-anchor and blocked-planning tests**

Add a fixture with a completed ladder at `{x:2,y:2}` and an empty air cell directly below it at `{x:2,y:1}`. Assert that `canPlaceBuilding(world, {type:'ladder', position:{x:2,y:1}})` is true. Add a blocked simulation fixture with an open support access request, available dirt/stone, and an existing completed ladder above the candidate site; after one tick assert that an access construction order is planned. Include an optional outpost candidate and assert that no outpost order is created while blocked.

- [x] **Step 2: Run the focused tests and verify failure**

Run `npm test -- --run src/game/engine.test.ts src/game/logistics.test.ts -t "anchor|blocked.*access|access.*blocked"`.

Expected: ladder placement is rejected and the blocked tick leaves the access request without an order.

- [x] **Step 3: Extend ladder anchors vertically**

In `src/game/buildings.ts`, update `hasLadderAnchor` so it checks four cardinal neighbors. Horizontal neighbors retain the current terrain/completed-building rule; vertical neighbors additionally accept a completed ladder or completed non-ladder building at that exact adjacent cell. Do not accept planned/under-construction buildings or arbitrary air.

- [x] **Step 4: Plan existing access requests during blocked ticks**

In `stepOnce`, change the blocked request branch to:

```ts
const requestedState =
  state.safety.phase === 'blocked'
    ? planAccessRequests(reopenResolvedAccessRequests(recoveredState))
    : planAccessRequests(recoveredState)
```

Keep the later blocked-state gate that skips `planExpansionOrder`, so optional outposts remain disabled while blocked.

- [x] **Step 5: Run focused tests and commit**

Run `npm test -- --run src/game/engine.test.ts src/game/logistics.test.ts`. Expected: existing construction/access tests and the new vertical-anchor/blocked-planning tests pass. Commit:

```bash
git add src/game/buildings.ts src/game/engine.ts src/game/engine.test.ts src/game/logistics.test.ts
git commit -m "fix: reopen anchored access recovery while blocked"
```

---

### Task 3: Model bounded emergency-drop safety

**Files:**
- Modify: `src/game/logistics.ts`
- Modify: `src/game/logistics.test.ts`

- [x] **Step 1: Add failing emergency-drop safety tests**

Create a grounded fixture with a dwarf above a mineable support block, a supported air landing one cell below after virtual clearing, and a reachable stockpile. Assert that an idle helper allows a one-cell drop, no helper/material rejects it, a two-cell landing is accepted, and a three-cell landing is rejected:

```ts
expect(assessDigSafety(withIdleHelper, stand, target)).toEqual(
  expect.objectContaining({ safe: true, dropDistance: 1 }),
)
expect(assessDigSafety(withNoHelperOrMaterial, stand, target)).toEqual({
  safe: false,
  failure: 'support',
})
expect(assessDigSafety(twoCellDropFixture, stand, target)).toEqual(
  expect.objectContaining({ safe: true, dropDistance: 2 }),
)
expect(assessDigSafety(threeCellDropFixture, stand, target)).toEqual({
  safe: false,
  failure: 'support',
})
```

Each accepted fixture must verify a storage path from the landing after virtual clearing; a lower cell alone is insufficient.

- [x] **Step 2: Run the new tests and verify failure**

Run `npm test -- --run src/game/logistics.test.ts -t "drop|support-breaking"`. Expected: all new tests fail because support failures currently return immediately and `DigSafety` has no recovery landing.

- [x] **Step 3: Add a bounded recovery result to dig safety**

Extend `DigSafety` with optional recovery data:

```ts
export type DigSafety = {
  safe: boolean
  failure?: AccessFailure
  storage?: StorageDestination
  dropDistance?: number
  landing?: Position
  recoveryWorld?: World
  recoveryMaterial?: CommonBuildingMaterial
}
```

Add a private helper that, only for a support failure, simulates clearing the target and checks the same column at one and two cells below the current stand. Require `isSupported(virtualWorld, landing)` and an idle-helper-or-available-common-material gate. Prefer a direct `findPath(virtualWorld, landing, storage.position)`; if that fails and common material is available, call the existing `findEmergencyLadderPlan` against the virtual state and carry its returned world/storage route in `recoveryWorld`/`storage`. Return the first valid candidate with `dropDistance`, `landing`, and the virtual/recovery world. If no candidate passes, preserve `{safe:false, failure:'support'}`.

Use `getAvailableConstructionMaterial` for common ladder material availability so emergency reserve and existing reservations remain protected. Treat an idle dwarf other than the mining dwarf as the alternate recovery gate. If a recovery ladder is selected, return the selected material and deduct it from the same state/storage accounting used by construction reservation before completing the dig. Do not allow storage-route failures to become emergency drops.

- [x] **Step 4: Revalidate the route after virtual clearing**

Find storage against the virtual world and use the landing as the origin. Do not use the current unsupported standing cell as the haul origin. If no storage route exists, leave the dig unsafe even when a landing exists.

- [x] **Step 5: Run logistics tests and commit**

Run `npm test -- --run src/game/logistics.test.ts`. Expected: all existing storage/support tests and bounded-drop tests pass. Commit:

```bash
git add src/game/logistics.ts src/game/logistics.test.ts src/game/types.ts
git commit -m "feat: add bounded support-breaking digs"
```

---

### Task 4: Execute diagonal mining and emergency landings in the engine

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/engine.test.ts`

- [x] **Step 1: Add failing engine tests**

Add deterministic fixtures asserting that a diagonal target creates a diagonal task path, a one-cell emergency drop lands on the supported cell and starts a haul, and a three-cell drop mines nothing:

```ts
it('assigns a diagonal mining target and moves diagonally', () => {
  const result = stepSimulation(diagonalStairFixture(), 1)
  expect(result.dwarves[0].task.kind).toBe('dig')
  expect(result.dwarves[0].task.target).toEqual({ x: 2, y: 2 })
  expect(result.dwarves[0].task.path[0]).toEqual({ x: 2, y: 2 })
})

it('lands a dwarf after a one-cell emergency support drop', () => {
  const result = runUntilMined(emergencyDropFixture(), 20)
  expect(result.dwarves[0].position).toEqual({ x: 2, y: 1 })
  expect(result.dwarves[0].carrying).not.toBeNull()
  expect(result.dwarves[0].task.kind).toBe('haul')
})

it('does not allow a support-breaking dig to fall three cells', () => {
  const result = runUntilMined(threeCellDropFixture(), 20)
  expect(result.totalCleared).toBe(0)
  expect(result.dwarves[0].task.kind).toBe('idle')
})
```

- [x] **Step 2: Run the engine tests and verify failure**

Run `npm test -- --run src/game/engine.test.ts -t "diagonal|emergency support|three cells"`. Expected: diagonal assignment/path and emergency-landing expectations fail before engine integration.

- [x] **Step 3: Permit diagonal task completion**

In the dig execution branch, replace the cardinal-only distance check with Chebyshev adjacency:

```ts
const adjacent =
  Math.max(
    Math.abs(dwarf.position.x - target.x),
    Math.abs(dwarf.position.y - target.y),
  ) === 1
if (!adjacent) return invalidateTask(state, dwarf)
```

Use the `DigSafety` recovery data when mining completes. Clear the target, choose `safety.recoveryWorld ?? nextWorld`, set the dwarf position to `safety.landing ?? dwarf.position`, and compute the haul path from that origin. Preserve existing cargo/reservation semantics and only set `movement: 'grounded'` when the chosen landing is supported.

- [x] **Step 4: Preserve current task invalidation and fall recovery**

Keep `validPath` as the authority for diagonal movement transitions. A stale diagonal path must invalidate through the existing `invalidateTask` recovery path. Do not broaden `settleDwarf` beyond its supported-column search; emergency drops use an explicitly validated landing.

- [x] **Step 5: Run engine tests and commit**

Run `npm test -- --run src/game/engine.test.ts`. Expected: all existing engine regressions and new diagonal/drop tests pass. Commit:

```bash
git add src/game/engine.ts src/game/engine.test.ts
git commit -m "feat: execute diagonal recovery mining"
```

---

### Task 5: Add the supplied-save regression and finish verification

**Files:**
- Modify: `src/game/engine.test.ts`
- Modify: `src/game/pathfinding.test.ts`
- Modify: `src/game/logistics.test.ts`
- Modify: `docs/superpowers/plans/2026-08-24-support-chain-recovery.md`

- [x] **Step 1: Add a deterministic support-chain regression**

Build a compact fixture equivalent to the supplied save: a completed stockpile at `{x:3,y:3}`, a completed ladder at `{x:2,y:3}`, air at `{x:2,y:2}`, a mineable support row at `y:1`, one open support access request, idle dwarves, and `safety.phase: 'blocked'`. Assert that one tick creates an anchored access ladder order, and that after the ladder is completed a dwarf can select a safe mining target.

- [x] **Step 2: Run the complete verification matrix**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, typecheck/lint/build succeed, and `git diff --check` is clean.

- [x] **Step 3: Replay the supplied save without committing a diagnostic harness**

Use a temporary Vitest diagnostic, then remove it, to parse `/Users/openclaw/Downloads/pixel-dwarves-save.json`, run up to 40 simulation ticks, and assert that either an access order is planned or a dwarf receives a diagonal/support-recovery task. Confirm the supplied save no longer remains unchanged for every tick.

- [x] **Step 4: Mark the plan complete and inspect the branch**

Mark every completed checkbox in this plan, then run:

```bash
git status --short --branch
git diff main...HEAD --stat
git diff --check
```

Confirm the branch contains no temporary diagnostic files and leave publication/merge for a separate explicit request.

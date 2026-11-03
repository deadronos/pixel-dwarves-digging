# Safe Access-First Mining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Prevent unsupported deep mining and world-bottom escapes by adding bedrock, predictive dig safety, access-first tunnel construction, and recoverable hauling behavior.

**Architecture:** Keep the simulation renderer-independent. Add a small access-planning layer beside the existing pathfinding and logistics modules: target selection classifies post-dig safety, access requests describe unsafe valuable work, and ordinary dig/build tasks execute only after a grounded route and storage route are valid. Save migration upgrades schema 2 to schema 3, while the UI exposes bedrock, access requests, and recovery states.

**Tech Stack:** TypeScript, Vitest, Zustand, React, React Three Fiber, Biome, Playwright browser smoke testing.

---

## File map

- Modify `src/game/types.ts`: add bedrock, access-request, task-purpose, recovery, and schema-related state types.
- Modify `src/game/content.ts`: define bedrock labels/colors and keep it out of mineable content and dig durations.
- Modify `src/game/generation.ts`: generate the bottom bedrock row and keep clearable-block accounting separate from solid-support accounting.
- Modify `src/game/pathfinding.ts`: expose post-dig safety and supported-route helpers without introducing a second movement graph.
- Modify `src/game/buildings.ts`: validate ladder/bridge access requests against reachable anchors and support.
- Modify `src/game/logistics.ts`: preserve carried material on route failure and expose storage-route checks for mining preflight.
- Modify `src/game/engine.ts`: classify safe work, create access requests, prioritize access tasks, and recover falling/stranded dwarves.
- Modify `src/game/state.ts`: initialize and preserve access state and migrate default state values.
- Modify `src/game/serialization.ts`: bump to schema 3 and migrate schema 2 saves with bedrock/access defaults.
- Modify `src/components/TerrainLayer.tsx`, `src/components/Inspector.tsx`, and `src/components/Hud.tsx`: render bedrock and expose access/recovery state.
- Modify `README.md` and `idea.md`: document safety-floor and access-first mining behavior.
- Modify `src/game/*.test.ts`: add focused regression coverage for each simulation rule.

### Task 1: Add bedrock and clearable-block semantics

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/content.ts`
- Modify: `src/game/generation.ts`
- Test: `src/game/generation.test.ts`

- [ ] **Step 1: Write failing tests for bedrock generation and completion accounting.**

Add tests that generate a deterministic world and assert:

```ts
expect(world.cells[0].block).toBe('bedrock')
expect(MINEABLE_BLOCKS).not.toContain('bedrock')
expect(isSolid('bedrock')).toBe(true)
```

Add a small world fixture containing only bedrock and air and assert `countSolids`/completion-facing clearable counting reports zero remaining mineable blocks.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm test -- --run src/game/generation.test.ts`

Expected: TypeScript/test failures because `bedrock` is not a `BlockType` and generation still creates ordinary terrain at `y = 0`.

- [ ] **Step 3: Implement bedrock as solid but non-mineable.**

Update the types so `BlockType` includes `bedrock` and `MineableBlockType` excludes both `air` and `bedrock`. Add a `BEDROCK_DEPTH = 1` constant in `content.ts`; add bedrock to `BLOCK_LABELS` and `BLOCK_COLORS`; do not add it to `MINEABLE_BLOCKS` or `DIG_DURATION`.

In `generateWorld`, return `{ block: 'bedrock', biome }` for every cell with `y < BEDROCK_DEPTH` before normal depth generation. Keep `isSolid('bedrock')` true. Change clearable counting/completion helpers to use `MINEABLE_BLOCKS.has(cell.block)` instead of treating every non-air cell as work. Update `stepOnce` in `src/game/engine.ts` to compute completion from the same mineable-block predicate, so bedrock remaining in the world does not prevent a run from completing.

- [ ] **Step 4: Run the focused tests and confirm they pass.**

Run: `npm test -- --run src/game/generation.test.ts`

Expected: all generation tests pass, including bedrock support and clearable-block accounting.

- [ ] **Step 5: Commit the bedrock foundation.**

Run:

```bash
git add src/game/types.ts src/game/content.ts src/game/generation.ts src/game/generation.test.ts
git commit -m "feat: add indestructible bedrock floor"
```

### Task 2: Add explicit access and task-purpose state

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/state.ts`
- Modify: `src/game/progression.ts`
- Test: `src/game/state.test.ts` or the existing state/progression test file

- [ ] **Step 1: Write failing state-shape tests.**

Assert that a fresh simulation has an empty access-request collection and that newly created dwarves have an ordinary task purpose. Assert that prestige and new-run creation also initialize an empty collection.

Use the concrete shape:

```ts
type AccessFailure = 'support' | 'return-route' | 'storage-route'
type AccessRequest = {
  id: string
  target: Position
  failure: AccessFailure
  priority: number
  approach?: Position
  worldRevision: number
  status: 'open' | 'resolved' | 'blocked'
}
```

Extend `TaskState` with `purpose?: 'ordinary' | 'access' | 'recovery'`, `accessRequestId?: string`, and `recoveryReason?: 'stranded' | 'storage-route'`. Add `accessRequests: AccessRequest[]` and `worldRevision: number` to `SimulationState`.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm test -- --run src/game/state.test.ts src/game/progression.test.ts`

Expected: failures for missing `accessRequests`, `worldRevision`, and task-purpose defaults.

- [ ] **Step 3: Implement default state initialization.**

Initialize `accessRequests: []` and `worldRevision: 0` in `createInitialSimulation`, prestige resets, and any test/state fixtures. Update dwarf creation helpers to use `purpose: 'ordinary'` only when a task is assigned; idle tasks may omit the purpose.

- [ ] **Step 4: Run the focused tests and typecheck.**

Run: `npm test -- --run src/game/state.test.ts src/game/progression.test.ts && npm run typecheck`

Expected: tests and typecheck pass with the new state fields.

- [ ] **Step 5: Commit the state model.**

Run:

```bash
git add src/game/types.ts src/game/state.ts src/game/progression.ts src/game/state.test.ts src/game/progression.test.ts
git commit -m "feat: add access planning state"
```

### Task 3: Add post-dig safety and storage-route checks

**Files:**
- Modify: `src/game/pathfinding.ts`
- Modify: `src/game/logistics.ts`
- Modify: `src/game/buildings.ts`
- Test: `src/game/pathfinding.test.ts`
- Test: `src/game/logistics.test.ts`

- [ ] **Step 1: Write failing tests for safety checks.**

Add fixtures for:

1. A dwarf standing above a removable block with bedrock below; clearing the block must report unsafe because the dwarf loses support.
2. A supported horizontal dig with a valid path back to the stockpile; clearing it must report safe.
3. A dig that disconnects the dwarf from every storage building; clearing it must report unsafe with `return-route` or `storage-route`.
4. A full or unreachable storage network; mining preflight must return no valid destination.

Expose a result with this stable contract:

```ts
type DigSafety = {
  safe: boolean
  failure?: AccessFailure
  storage?: StorageDestination
}
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm test -- --run src/game/pathfinding.test.ts src/game/logistics.test.ts`

Expected: missing safety helper failures.

- [ ] **Step 3: Implement post-dig simulation.**

Add a pathfinding helper that creates a shallow world copy with one target cell cleared, then checks `isSupported(worldAfterDig, stand)` and finds a path from `stand` to a storage destination. Use existing `findPath` and `selectStorageDestination` so safety and hauling share the same graph.

Add `selectStorageDestination` support for a caller-provided world snapshot and make it return `null` when no reachable storage with capacity exists. Add a logistics helper that answers whether a carried block can still reach storage without mutating inventory.

Update building placement validation so ladder requests require an air cell, a completed horizontal anchor, and a reachable builder route; bridge requests must retain their existing anchored-end rule.

- [ ] **Step 4: Run the focused tests and confirm they pass.**

Run: `npm test -- --run src/game/pathfinding.test.ts src/game/logistics.test.ts`

Expected: all safety, storage-route, and placement tests pass.

- [ ] **Step 5: Commit the safety primitives.**

Run:

```bash
git add src/game/pathfinding.ts src/game/logistics.ts src/game/buildings.ts src/game/pathfinding.test.ts src/game/logistics.test.ts
git commit -m "feat: add post-dig safety checks"
```

### Task 4: Make mining safety-first and preserve haul recovery

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/logistics.ts`
- Test: `src/game/engine.test.ts`

- [ ] **Step 1: Write failing engine tests.**

Add tests that assert:

- A dwarf does not receive a dig task for the only-support block below them.
- When both safe and unsafe exposed targets exist, the safe target is assigned even if the unsafe target has a stronger depth/mineral score.
- A mined block is not cleared if the post-dig storage route is unavailable.
- A dwarf carrying a block retains `carrying` and a recovery/haul task when its route disappears.
- A falling dwarf settles on supported air above bedrock, cancels its old task, and recalculates a storage route.
- A stranded dwarf stops receiving mining tasks and exposes a recovery reason.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm test -- --run src/game/engine.test.ts`

Expected: current target selection assigns unsafe digs or loses the recovery path because the engine does not run post-dig safety preflight.

- [ ] **Step 3: Implement safe target classification.**

Change `chooseTarget` to classify candidates with the post-dig safety helper. Sort safe candidates using the existing policy score, and return unsafe valuable candidates separately for access-request creation. Do not assign unsafe candidates as ordinary dig tasks.

Before a dig completes, clear a simulated copy first and require the safety result to include a storage destination. If it fails, reset the task to idle/access planning without changing the target cell.

Increment `worldRevision` on every terrain clear and completed building. Invalidate reachable-work caches whenever the revision changes.

- [ ] **Step 4: Implement recovery without material loss.**

When a dwarf loses support, cancel its active task after settling and assign a haul/recovery task if it is carrying material. When a haul path is missing, keep `carrying` unchanged, set `purpose: 'recovery'`, and let the planner retry storage or request access. Remove the current fallback that creates an empty haul path to the stockpile.

Ensure `falling` is transient: the next tick settles a dwarf on supported air, and only a genuine lack of supported cells produces `stranded`.

- [ ] **Step 5: Run engine tests and confirm they pass.**

Run: `npm test -- --run src/game/engine.test.ts`

Expected: all existing engine tests plus the new safety/recovery tests pass.

- [ ] **Step 6: Commit safety-first mining.**

Run:

```bash
git add src/game/engine.ts src/game/logistics.ts src/game/engine.test.ts
git commit -m "feat: prevent unsafe mining and recover haulers"
```

### Task 5: Plan stair-step access and access-first construction

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/logistics.ts`
- Test: `src/game/engine.test.ts`
- Test: `src/game/buildings.test.ts`

- [ ] **Step 1: Write failing access-planning tests.**

Add tests that assert:

- An unsafe deep target produces exactly one open access request.
- A safe side cell is assigned as an access-purpose dig before the deep target.
- A stair-step sequence alternates safe horizontal and vertical cells rather than mining directly below the dwarf.
- A ladder order is created only after its shaft cell is air, anchored, and reachable by a builder.
- Access orders are selected before optional outpost orders under every construction policy.
- Resolving a route removes or marks its request resolved and allows the original target to be reconsidered.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm test -- --run src/game/engine.test.ts src/game/buildings.test.ts`

Expected: no access requests or access-purpose tasks are currently generated.

- [ ] **Step 3: Implement deduplicated access requests.**

Add helpers that create/update an `AccessRequest` keyed by target coordinates. Use the target's existing score as request priority, but never let an unsafe request displace safe ordinary work. Revalidate requests after each `worldRevision` change; mark them resolved when the target becomes safe and blocked when no route candidate remains.

- [ ] **Step 4: Implement safe stair-step route selection.**

For an open request, enumerate cardinal side cells adjacent to the current reachable frontier. Prefer a sequence that moves horizontally before descending, then validate every intermediate dig with the post-dig safety helper. Assign the first unmined safe preparatory cell as a `purpose: 'access'` dig. Do not create diagonal movement; represent the diagonal route as alternating cardinal cells.

- [ ] **Step 5: Implement ladder/bridge construction requests.**

When an access route reaches an existing air shaft, create a `ConstructionOrder` with `reason: 'access'` for a ladder if `canPlaceBuilding` passes. Use bridges for anchored horizontal gaps. Reserve stone before assigning the order, and prevent duplicate orders for the same request/cell.

Change builder selection to rank `reason: 'access'` orders ahead of `outpost`, `capacity`, and `policy` orders. Keep `conserve` restricted to access/recovery orders, while `balanced` and `expand` may continue to optional work after access is satisfied.

- [ ] **Step 6: Run access tests and confirm they pass.**

Run: `npm test -- --run src/game/engine.test.ts src/game/buildings.test.ts`

Expected: access requests deduplicate, stair-step preparation precedes deep mining, and ladder/bridge construction respects physical anchors and builder reachability.

- [ ] **Step 7: Commit access-first planning.**

Run:

```bash
git add src/game/engine.ts src/game/buildings.ts src/game/logistics.ts src/game/engine.test.ts src/game/buildings.test.ts
git commit -m "feat: build access before unsafe excavation"
```

### Task 6: Migrate saves to schema 3

**Files:**
- Modify: `src/game/serialization.ts`
- Modify: `src/game/state.ts`
- Test: `src/game/serialization.test.ts`

- [ ] **Step 1: Write failing migration tests.**

Add tests that parse a schema 2 save and assert:

- `schemaVersion` becomes 3,
- every bottom-row cell becomes bedrock,
- `accessRequests` is an empty array when absent,
- `worldRevision` defaults to 0 when absent,
- carried materials remain on dwarves,
- buildings, stored inventory, policy, upgrades, and progress are preserved.

Add a schema 3 round-trip test containing an open access request and a recovery task.

- [ ] **Step 2: Run serialization tests and verify they fail.**

Run: `npm test -- --run src/game/serialization.test.ts`

Expected: schema 3 is rejected or missing fields are not normalized.

- [ ] **Step 3: Implement schema 3 parsing and migration.**

Set `SAVE_VERSION = 3`. Accept schema 2 as a migration input, add bedrock to the bottom row, initialize missing access fields, and normalize task purposes/recovery fields. Preserve all existing inventory ownership exactly. Keep schema 1 migration working by routing it through the existing stockpile migration before the schema 3 normalization.

- [ ] **Step 4: Run serialization tests and confirm they pass.**

Run: `npm test -- --run src/game/serialization.test.ts`

Expected: schema 1, schema 2, and schema 3 migration/round-trip tests pass.

- [ ] **Step 5: Commit save migration.**

Run:

```bash
git add src/game/serialization.ts src/game/state.ts src/game/serialization.test.ts
git commit -m "feat: migrate saves to schema three"
```

### Task 7: Expose bedrock, access, and recovery in the UI

**Files:**
- Modify: `src/components/TerrainLayer.tsx`
- Modify: `src/components/Hud.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `README.md`
- Modify: `idea.md`

- [ ] **Step 1: Add UI regression expectations.**

Keep the existing smoke-test selectors stable and add visible labels for `access`, `recovery`, `stranded`, and bedrock. The inspector should show open access-request count and the selected dwarf's movement/task state.

- [ ] **Step 2: Implement bedrock and access status rendering.**

Use the existing block color/label mapping for bedrock in the terrain layer. Add compact HUD/inspector rows for open access requests and recovery states without adding per-dwarf controls. Add an access marker or construction indicator for an open request when one is available.

- [ ] **Step 3: Update gameplay documentation.**

Document that dwarves prefer safe supported mining, create access routes before unsafe depth, and use bedrock as the permanent world floor. Mention that stair-step tunnels are cardinal grid routes and that ladders/bridges are built only after valid anchors exist.

- [ ] **Step 4: Run typecheck and lint.**

Run: `npm run typecheck && npm run lint`

Expected: no type or formatting errors.

- [ ] **Step 5: Commit UI/documentation changes.**

Run:

```bash
git add src/components/TerrainLayer.tsx src/components/Hud.tsx src/components/Inspector.tsx README.md idea.md
git commit -m "feat: expose mining access status"
```

### Task 8: Full verification and browser smoke test

**Files:**
- Modify: none unless verification finds a defect.
- Test: all existing simulation tests and browser smoke flow.

- [ ] **Step 1: Run the complete pure simulation suite.**

Run: `npm test -- --run`

Expected: all existing and new tests pass, including bedrock, safety, access planning, recovery, and migration coverage.

- [ ] **Step 2: Run static and production checks.**

Run:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands pass. A Vite chunk-size warning is acceptable if the build exits successfully and produces the app bundle.

- [ ] **Step 3: Run browser smoke coverage.**

Start the app with the repository's normal dev command and verify with Playwright:

1. A fresh run renders the main stockpile and bottom bedrock.
2. Dwarves remain visible and do not disappear through the bottom edge.
3. The inspector exposes access/recovery state fields.
4. A safe horizontal dig creates a haul and deposits its material.
5. An unsafe downward target creates an access state instead of assigning a direct dig.
6. A completed ladder or stair-step route changes the reachable work area.
7. There are no console errors or Vite error overlays.

- [ ] **Step 4: Inspect the final diff and status.**

Run: `git status --short --branch && git log --oneline origin/main..HEAD`

Expected: only intentional commits are present, the working tree is clean, and the branch contains the implementation commits.

- [ ] **Step 5: Commit any final verification fix and report evidence.**

If verification requires a fix, add a focused regression test first, implement the smallest correction, rerun the affected checks, and commit it with a behavior-specific message. Otherwise, report the passing test count, static checks, build result, browser smoke result, and changed branch/PR state.

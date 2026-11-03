# Building Logistics Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden stockpile coordinate and unrestricted air movement with visible buildings, finite physical storage, grounded navigation, autonomous construction, bridges, ladders, and remote outposts.

**Architecture:** Extend the renderer-independent simulation model with a building overlay, per-building storage, construction orders, and support-aware navigation. Keep terrain cells immutable during movement-only ticks, invalidate navigation/logistics caches after terrain or building changes, and let R3F render buildings as a layer between terrain and dwarves. Preserve autonomous-first colony policies; do not add individual dwarf commands.

**Tech Stack:** React 19, TypeScript 7, React Three Fiber, Three.js, Zustand, Vitest, Biome, Vite.

---

## File map

- Modify `src/game/types.ts` to add building, storage, construction, task, and schema types while retaining JSON-compatible state.
- Modify `src/game/content.ts` to define building recipes, capacities, and construction policy labels.
- Modify `src/game/generation.ts` to create a deterministic level-1 main stockpile footprint and a valid starter support surface.
- Modify `src/game/pathfinding.ts` to traverse only supported cells and use completed bridges/ladders as navigation overlays.
- Modify `src/game/engine.ts` to apply gravity, assign build tasks, carry materials physically, deposit to storage, and invalidate derived navigation after changes.
- Modify `src/game/state.ts` to expose construction/logistics policies and preserve them through new runs and saves.
- Modify `src/game/serialization.ts` to write schema version 2 and migrate schema version 1 saves.
- Add `src/game/buildings.ts` for building placement, support checks, storage lookup, material reservation, and construction completion.
- Add `src/game/logistics.ts` for aggregate inventory, storage destination selection, and construction/outpost requests.
- Add `src/components/BuildingLayer.tsx` to render the stockpile, outposts, bridges, ladders, and construction states.
- Modify `src/components/WorldCanvas.tsx` to render buildings between terrain and dwarves.
- Modify `src/components/Hud.tsx`, `src/components/Inspector.tsx`, and `src/components/ControlBar.tsx` to expose physical storage and colony-wide build/logistics policy.
- Modify `src/styles.css` for building colors, capacity indicators, and construction status.
- Extend `src/game/generation.test.ts`, `src/game/pathfinding.test.ts`, `src/game/engine.test.ts`, `src/game/serialization.test.ts`, and `src/game/state.test.ts` with regression coverage.
- Add `src/game/buildings.test.ts` and `src/game/logistics.test.ts` for focused pure-function tests.
- Update `README.md` and `idea.md` with the building/logistics loop and save migration note.

## Task 1: Add the building and storage domain model

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/content.ts`
- Create: `src/game/buildings.ts`
- Test: `src/game/buildings.test.ts`

- [ ] **Step 1: Add failing building tests**

Create a small 8×6 fixture with a level-1 stockpile and assert the public helpers that will be implemented:

```ts
it('finds the primary stockpile and reports finite capacity', () => {
  const state = makeBuildingState()
  expect(getPrimaryStockpile(state.world)?.level).toBe(1)
  expect(getStorageCapacity(state.world, 'stockpile-1')).toBe(120)
})

it('accepts a grounded outpost placement but rejects unsupported space', () => {
  const state = makeBuildingState()
  expect(canPlaceBuilding(state.world, { type: 'outpost', position: { x: 5, y: 3 } })).toBe(true)
  expect(canPlaceBuilding(state.world, { type: 'outpost', position: { x: 5, y: 1 } })).toBe(false)
})

it('reserves and consumes construction stone exactly once', () => {
  const state = makeBuildingState()
  const reserved = reserveConstructionMaterials(state, 'outpost-order')
  const completed = completeConstruction(reserved, 'outpost-order')
  expect(completed.simulation.world.buildings).toContainEqual(expect.objectContaining({ type: 'outpost', construction: 'completed' }))
  expect(completed.simulation.inventory.stone).toBe(reserved.simulation.inventory.stone)
})
```

The fixture should model `world.cells`, `world.buildings`, `storage`, and a construction order with an explicit `required` stone count. Keep the tests renderer-independent.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run `npm test -- src/game/buildings.test.ts --run`.

Expected: failure because building types and helpers do not exist.

- [ ] **Step 3: Define the data model**

Add these concepts to `src/game/types.ts`:

```ts
export type BuildingType = 'stockpile' | 'outpost' | 'bridge' | 'ladder'
export type BuildingConstruction = 'completed' | 'planned' | 'under-construction'
export type ConstructionPolicy = 'conserve' | 'balanced' | 'expand'

export type StorageState = {
  capacity: number
  inventory: Partial<Inventory>
}

export type BuildingState = {
  id: string
  type: BuildingType
  position: Position
  width: number
  height: number
  level: number
  construction: BuildingConstruction
  storage?: StorageState
}

export type ConstructionOrder = {
  id: string
  buildingId: string
  type: Exclude<BuildingType, 'stockpile'>
  required: Partial<Inventory>
  reserved: Partial<Inventory>
  delivered: Partial<Inventory>
  progress: number
  reason: 'access' | 'outpost' | 'capacity' | 'policy'
}
```

Add `buildings: BuildingState[]` to `World`. Add `constructionOrders: ConstructionOrder[]` and `constructionPolicy: ConstructionPolicy` to `SimulationState`, because buildings are generated map entities while orders and policy are active run state. Replace `world.stockpile` consumers with a primary-building lookup; keep an optional legacy `stockpile` coordinate only inside the version-1 migration input shape, not in the version-2 runtime model.

- [ ] **Step 4: Add building content definitions**

Define stable constants in `src/game/content.ts`:

```ts
export const BUILDING_DEFINITIONS = {
  stockpile: { width: 3, height: 2, capacity: 120 },
  outpost: { width: 2, height: 2, capacity: 48, stone: 12 },
  bridge: { width: 1, height: 1, stone: 2 },
  ladder: { width: 1, height: 1, stone: 1 },
} as const
```

Keep recipes deterministic and use stone as the only construction material for this feature.

- [ ] **Step 5: Implement placement, storage, and reservation helpers**

Implement `getPrimaryStockpile`, `getStorageBuilding`, `getStorageCapacity`, `canPlaceBuilding`, `createBuilding`, `reserveConstructionMaterials`, and `completeConstruction` in `src/game/buildings.ts`. Placement must reject out-of-bounds footprints, solid-overlap, unsupported outposts, duplicate IDs, and bridge/ladder positions without a valid anchor. Inventory reservations must be removed from available inventory once and released on cancellation.

- [ ] **Step 6: Run focused tests and commit**

Run `npm test -- src/game/buildings.test.ts --run`.

Expected: all building-model tests pass.

Commit with `git add src/game/types.ts src/game/content.ts src/game/buildings.ts src/game/buildings.test.ts && git commit -m "feat: add building and storage domain model"`.

## Task 2: Generate and render the main stockpile

**Files:**
- Modify: `src/game/generation.ts`
- Create: `src/components/BuildingLayer.tsx`
- Modify: `src/components/WorldCanvas.tsx`
- Modify: `src/styles.css`
- Test: `src/game/generation.test.ts`

- [ ] **Step 1: Add the generation regression test**

Extend the starter-pocket test to assert that the same seed creates the same completed stockpile, that the stockpile footprint is inside the starter pocket, and that every footprint cell is supported or walkable.

- [ ] **Step 2: Run the generation test and confirm the new assertion fails**

Run `npm test -- src/game/generation.test.ts --run`.

Expected: failure because generated worlds do not yet contain building state.

- [ ] **Step 3: Generate a deterministic level-1 stockpile**

Place a 3×2 stockpile at the starter pocket near the current start coordinate. Clear only the footprint cells required for its walkable loading area; preserve terrain below it as support. Store its initial inventory as empty and capacity as the level-1 definition. Update `createInitialSimulation` so all new runs initialize their primary stockpile consistently.

- [ ] **Step 4: Implement `BuildingLayer`**

Render completed and under-construction buildings as crisp box meshes or instanced primitives. Give the stockpile a distinct silhouette, loading-area highlight, and capacity state. Render bridge and ladder overlays from building positions. Do not put building meshes in `TerrainLayer`; preserve the renderer boundary.

- [ ] **Step 5: Wire and style the layer**

Render `<BuildingLayer world={world} />` after `TerrainLayer` and before `DwarfLayer`. Add styles/visual constants for stockpile brass, outpost teal, bridge wood/stone, ladder accent, and construction progress without changing the existing dark pixel palette.

- [ ] **Step 6: Run tests and commit**

Run `npm test -- src/game/generation.test.ts --run`, `npm run typecheck`, and `npm run build`.

Expected: generation tests, typecheck, and production build pass.

Commit with `git add src/game/generation.ts src/game/generation.test.ts src/components/BuildingLayer.tsx src/components/WorldCanvas.tsx src/styles.css && git commit -m "feat: render the main stockpile building"`.

## Task 3: Make navigation physically grounded

**Files:**
- Modify: `src/game/pathfinding.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/pathfinding.test.ts`
- Test: `src/game/engine.test.ts`

- [ ] **Step 1: Add failing support-aware path tests**

Add fixtures for these cases:

```ts
it('does not route through unsupported open air', () => {
  const world = makeWorld(['......', '......', '..##..', '......'])
  expect(findPath(world, { x: 0, y: 2 }, { x: 5, y: 2 })).toBeNull()
})

it('uses a completed bridge across a gap', () => {
  const world = makeWorldWithBridge(['......', '......', '..##..', '......'], 2, 2, 3)
  expect(findPath(world, { x: 1, y: 1 }, { x: 4, y: 1 })).toEqual(expect.any(Array))
})

it('uses a connected ladder for vertical travel', () => {
  const world = makeWorldWithLadder()
  expect(findPath(world, { x: 2, y: 4 }, { x: 2, y: 1 })).toEqual(expect.any(Array))
})
```

Add an engine regression proving a dwarf whose support is mined is repositioned downward rather than continuing to occupy unsupported air.

- [ ] **Step 2: Run pathfinding and engine tests and confirm the new tests fail**

Run `npm test -- src/game/pathfinding.test.ts src/game/engine.test.ts --run`.

Expected: unsupported-air and support-removal tests fail against the current air-only pathfinding.

- [ ] **Step 3: Implement support predicates and overlay traversal**

Add pure helpers such as `isSupported(world, position)`, `isWalkable(world, position)`, `canMoveBetween(world, from, to)`, and `findPath`. A position is horizontally walkable only when its destination air cell has support below. A vertical edge is valid only when the relevant ladder/building overlay connects both positions. Bridges provide support beneath their occupied air cell. Guard all building footprint and terrain bounds.

- [ ] **Step 4: Implement gravity/repositioning**

Before task assignment in each simulation tick, find dwarves in unsupported cells and move them downward through air until a supported cell is found. Preserve carried inventory and reset only the invalidated movement path. If no supported destination exists, set a `stranded` movement/task state that cannot perform work until an access construction request succeeds.

- [ ] **Step 5: Update exposed-target selection**

Only report mineable targets adjacent to a valid standing cell. Keep the existing policy scoring and reservation semantics. When a world changes due to mining or construction, invalidate the existing `WeakMap` reachability cache by using the new world identity.

- [ ] **Step 6: Run focused tests and commit**

Run `npm test -- src/game/pathfinding.test.ts src/game/engine.test.ts --run`, `npm run typecheck`, and `npm run lint`.

Expected: all focused tests, typecheck, and lint pass.

Commit with `git add src/game/pathfinding.ts src/game/engine.ts src/game/pathfinding.test.ts src/game/engine.test.ts src/game/types.ts && git commit -m "feat: ground dwarf navigation and support"`.

## Task 4: Move hauling to physical per-building storage

**Files:**
- Create: `src/game/logistics.ts`
- Modify: `src/game/engine.ts`
- Modify: `src/game/state.ts`
- Test: `src/game/logistics.test.ts`
- Modify: `src/game/engine.test.ts`

- [ ] **Step 1: Add failing logistics tests**

Cover aggregate inventory, available capacity, nearest valid storage selection, physical deposit timing, and full-storage behavior:

```ts
it('does not count a mined block as stored until deposit', () => {
  const afterMining = stepUntilCarrying(makeStorageState())
  expect(getAggregateInventory(afterMining).dirt).toBe(1)
  expect(afterMining.world.buildings[0].storage?.inventory.dirt ?? 0).toBe(0)
})

it('redirects a haul to an outpost when the main stockpile is full', () => {
  const state = makeStorageStateWithFullMainStockpile()
  expect(selectStorageDestination(state, 'stone')).toEqual({ id: 'outpost-1' })
})
```

- [ ] **Step 2: Run focused logistics tests and confirm they fail**

Run `npm test -- src/game/logistics.test.ts src/game/engine.test.ts --run`.

Expected: failure because inventory is currently global and the engine deposits immediately by incrementing it at mining completion.

- [ ] **Step 3: Implement logistics helpers**

Implement `getAggregateInventory`, `getAvailableCapacity`, `selectStorageDestination`, `depositCarriedMaterial`, and `scoreStorageDestination`. Count building storage plus carried materials in aggregate totals. Respect the existing nearest-stockpile and finish-current-route policies, expanding them to all storage buildings.

- [ ] **Step 4: Update the engine haul lifecycle**

Keep the mined block on `dwarf.carrying` until the dwarf reaches the selected storage building. Deposit only at the destination, update that building's inventory, clear carrying state, and return to idle. If the destination fills or becomes unreachable, reselect another valid storage building; otherwise keep the haul paused instead of losing the material.

- [ ] **Step 5: Update store actions and HUD selectors**

Preserve global inventory selectors by deriving them from `getAggregateInventory`. Ensure new runs, prestige, imports, and resets initialize building storage and carried inventory consistently. Keep save/autosave behavior unchanged apart from the schema update in Task 6.

- [ ] **Step 6: Run focused tests and commit**

Run `npm test -- src/game/logistics.test.ts src/game/engine.test.ts --run`, `npm run typecheck`, and `npm run build`.

Expected: physical-haul tests, typecheck, and build pass.

Commit with `git add src/game/logistics.ts src/game/engine.ts src/game/state.ts src/game/logistics.test.ts src/game/engine.test.ts src/components/Hud.tsx && git commit -m "feat: store mined materials in physical buildings"`.

## Task 5: Add autonomous construction, bridges, ladders, and outposts

**Files:**
- Modify: `src/game/engine.ts`
- Modify: `src/game/logistics.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/state.ts`
- Test: `src/game/buildings.test.ts`
- Test: `src/game/logistics.test.ts`
- Test: `src/game/engine.test.ts`

- [ ] **Step 1: Add failing construction tests**

Cover builder assignment, material reservation, multi-tick construction, route invalidation, bridge connection, ladder connection, and outpost creation on stable ground. Assert that no order is created at an unreachable or unsupported site.

- [ ] **Step 2: Run the construction tests and confirm they fail**

Run `npm test -- src/game/buildings.test.ts src/game/logistics.test.ts src/game/engine.test.ts --run`.

Expected: failure because `build` tasks, construction order planning, and outpost requests do not exist.

- [ ] **Step 3: Add the build task and policy**

Extend `TaskKind` with `build`, add a `buildingId`/`constructionOrderId` to `TaskState`, add `constructionPolicy` to `SimulationState`, and expose a store action that changes only the colony-wide policy. Any idle dwarf may claim a construction task according to policy score; no individual assignment UI is added.

- [ ] **Step 4: Generate and advance construction orders**

Create route/access requests from unreachable valuable work and storage-capacity requests when a storage building is full or near full. Claim only orders whose material source and construction site are reachable. Builders travel to storage, carry reserved stone, travel to the site, advance construction, complete the building, and invalidate support/navigation/logistics caches.

- [ ] **Step 5: Implement bridges, ladders, and outposts**

Enforce the placement rules from `buildings.ts`: bridges extend from an anchored supported end, ladders connect supported levels, and outposts require stable ground and an existing route. Add deterministic IDs and construction footprints. Once completed, the overlay immediately changes pathfinding and storage destination selection.

- [ ] **Step 6: Run focused tests and commit**

Run `npm test -- src/game/buildings.test.ts src/game/logistics.test.ts src/game/engine.test.ts --run`, `npm run typecheck`, and `npm run lint`.

Expected: all construction and routing tests pass.

Commit with `git add src/game/types.ts src/game/buildings.ts src/game/logistics.ts src/game/engine.ts src/game/state.ts src/game/buildings.test.ts src/game/logistics.test.ts src/game/engine.test.ts && git commit -m "feat: add autonomous construction and logistics expansion"`.

## Task 6: Version saves and expose building/logistics UI

**Files:**
- Modify: `src/game/serialization.ts`
- Modify: `src/game/serialization.test.ts`
- Modify: `src/components/BuildingLayer.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/components/ControlBar.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add migration and UI regression tests**

Add a schema version 1 payload fixture containing `world.stockpile` and global inventory. Assert that `parseSave` returns a version 2 state with a level-1 primary stockpile containing that inventory and empty construction orders. Add to `src/game/state.test.ts` a test equivalent to `store.getState().setConstructionPolicy('expand'); expect(store.getState().simulation.constructionPolicy).toBe('expand')`, while asserting the world reference is unchanged.

- [ ] **Step 2: Run serialization tests and confirm migration fails**

Run `npm test -- src/game/serialization.test.ts --run`.

Expected: failure because the serializer currently accepts only schema version 1 and has no building state.

- [ ] **Step 3: Implement schema version 2 and migration**

Set `SAVE_VERSION = 2`. Accept version 2 directly and migrate version 1 by creating the primary stockpile at the old coordinate, transferring global inventory into it, preserving terrain/dwarves/policies/upgrades/progression, and initializing new fields. Reject malformed building footprints, negative capacities, invalid construction states, and unsupported versions with clear existing-style errors.

- [ ] **Step 4: Add inspector and control UI**

Show main stockpile capacity, outpost count, stored-versus-carried totals, active construction count, and the current construction policy. Add a construction-policy selector with `conserve`, `balanced`, and `expand`. Keep the existing autonomous work and hauling controls.

- [ ] **Step 5: Add building visual status**

Show capacity fill, under-construction progress, and simple route/access markers in `BuildingLayer`. Keep the main stockpile visually obvious on a fresh run and ensure materials held by dwarves are distinguishable from stored materials.

- [ ] **Step 6: Run focused tests and commit**

Run `npm test -- src/game/serialization.test.ts src/game/state.test.ts --run`, `npm run typecheck`, and `npm run build`.

Expected: migration tests, typecheck, and build pass.

Commit with `git add src/game/serialization.ts src/game/serialization.test.ts src/components/BuildingLayer.tsx src/components/Inspector.tsx src/components/ControlBar.tsx src/styles.css && git commit -m "feat: expose building logistics state and migrate saves"`.

## Task 7: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `idea.md`
- Modify: existing test files only if regression fixes are required.

- [ ] **Step 1: Document the building/logistics loop**

Explain stockpile capacity, grounded movement, builder policy, bridges/ladders, outposts, physical storage, and version 1 save migration. Include the exact policy names and the fact that player control remains colony-wide.

- [ ] **Step 2: Run the complete validation suite**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
git diff --check
```

Expected: all commands exit 0 with no diff-check errors.

- [ ] **Step 3: Run browser smoke verification**

Start the Vite dev server and verify a fresh run shows the main stockpile, dwarves remain on supported paths, mined material is carried before delivery, construction policy changes work, and the export/import flow preserves buildings and storage. Check the browser console for errors and confirm the app does not show an error overlay.

- [ ] **Step 4: Commit documentation and verification fixes**

Commit with `git add README.md idea.md src && git commit -m "docs: document building logistics gameplay"` after all checks pass.

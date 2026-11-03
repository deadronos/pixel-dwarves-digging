# Simulation rules

Invariants for anything in `src/game/`. Breaking one usually passes
typecheck but fails, or silently corrupts, at runtime.

- **Deterministic.** Generation and ticks use the seeded RNG in
  `src/game/rng.ts`. `Math.random()` is only for picking a new run's seed.
- **Immutable, JSON-compatible state.** Return new objects; don't mutate
  `SimulationState`. No classes, `Map`s or functions in state. There are two
  exceptions. `world.topologyKey` is an identity object used only for cache
  lookups. `world.cells` is a `Uint8Array` with one block id per cell
  (row-major, y=0 is the bottom row). Treat it as immutable too: copy with
  `slice()` before changing a cell, as `clearCell` does. This matters:
  `countSolids` and `countMinerals` cache their results per array, so an
  in-place edit leaves stale counts. Read it through
  `getBlock`/`blockAt` in `src/game/blocks.ts`, which owns the id table.
  Never reorder or remove ids there; append new block types only. Biome lives
  in `world.biomes[x]`, not per cell.
- **Typed-array cells are serialized explicitly.** `serializeState` writes
  `world.cells` as a base64 string (schema 5 and later). `parseSave` decodes
  and validates it (length and block ids), and older schemas migrate their
  `{ block, biome }[]` arrays to bytes. Plain `JSON.stringify` of a state
  would turn the array into an object, so always go through `serializeState`.
- **Walkability changes need a new topology key.** Pathfinding and targeting
  caches are keyed on `world.topologyKey`. Anything that changes walkability
  (clearing cells, completing a building) must set a new one with
  `createTopologyKey()`, as `clearCell` and construction completion do.
  Inventory-only and planned-building changes must keep the old key.
- **Save shape changes need a migration.** Bump `SAVE_VERSION`, add a step in
  `serialization/migrations.ts`, and test loading the previous version.
- **Performance budgets are guards.** A tick should take well under 100 ms
  so 4× speed keeps headroom for rendering. `*.performance.test.ts` enforce
  time budgets. Fix the slowdown; don't loosen the budget.
- **Gameplay changes update the design doc.** Keep `docs/game-design.md` in
  step with rules and balance in `content.ts` and `engine/`.

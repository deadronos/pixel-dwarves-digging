# Simulation rules

Invariants for anything in `src/game/`. Breaking one usually passes
typecheck but fails, or silently corrupts, at runtime.

- **Deterministic.** Generation and ticks use the seeded RNG in
  `src/game/rng.ts`. `Math.random()` is only for picking a new run's seed.
- **Immutable, JSON-compatible state.** Return new objects; don't mutate
  `SimulationState`. No classes, `Map`s or functions in state.
- **Walkability changes need a new topology key.** Pathfinding and targeting
  caches are keyed on `world.topologyKey`. Anything that changes walkability
  (clearing cells, completing a building) must set a new one with
  `createTopologyKey()`, as `clearCell` and construction completion do.
  Inventory-only and planned-building changes must keep the old key.
- **Save shape changes need a migration.** Bump `SAVE_VERSION`, add a step in
  `serialization/migrations.ts`, and test loading the previous version.
- **Performance budgets are guards.** `*.performance.test.ts` enforce time
  budgets. Fix the slowdown; don't loosen the budget.
- **Gameplay changes update the design doc.** Keep `docs/game-design.md` in
  step with rules and balance in `content.ts` and `engine/`.

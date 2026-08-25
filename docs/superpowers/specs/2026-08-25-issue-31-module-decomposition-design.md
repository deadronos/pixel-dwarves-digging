# Issue #31 Module Decomposition Design

## Goal

Split the simulation's engine, logistics, and serialization concentration points into focused modules without changing simulation behavior, deterministic results, save data, or existing public imports.

## Constraints and invariants

- Preserve the current `SimulationState`, `World`, and serialized save schema exactly.
- Preserve deterministic seeded simulation behavior, including task tie-breaks, pathfinding decisions, recovery transitions, and construction order decisions.
- Preserve world-identity replacement semantics used by pathfinding, dig-safety, and storage-expansion caches.
- Keep simulation modules renderer-independent.
- Avoid dependency cycles; shared domain types remain in `src/game/types.ts`, and low-level helpers remain in `buildings.ts`, `generation.ts`, and `pathfinding.ts`.
- Keep the existing top-level module imports working through thin facades or explicit re-exports.

## Module boundaries

### Engine

`src/game/engine.ts` remains the simulation orchestrator. It owns the tick loop, state assembly, dwarf iteration, and final completion/no-progress bookkeeping.

- `src/game/engine/targeting.ts` owns reachable work discovery, target scoring/tie-breaking, unsafe-target selection, and access-target selection.
- `src/game/engine/accessRequests.ts` owns access-request resolution, reopening, trimming, and the construction-order planning pass for open requests.
- `src/game/engine/recovery.ts` owns safety-state transitions, recovery-task construction, emergency recovery attempts, and recovery-specific world/state decisions.
- `src/game/engine/tasks.ts` owns task lifecycle helpers and dwarf advancement result types/operations that are not orchestration-specific.

Extracted modules may depend on `content.ts`, `generation.ts`, `logistics/*`, `pathfinding.ts`, `buildings.ts`, and `types.ts`, but they must not import the top-level `engine.ts`.

### Logistics

`src/game/logistics.ts` becomes a compatibility facade for public logistics APIs and a small composition surface. The implementation is divided by decision responsibility:

- `src/game/logistics/storage.ts` owns storage discovery, capacity accounting, aggregate inventory, storage destination selection, and material availability helpers.
- `src/game/logistics/access.ts` owns access construction orders, emergency ladder planning, and stale/orphaned order recovery.
- `src/game/logistics/safety.ts` owns dig-safety evaluation, support/drop checks, and the world-identity safety cache.
- `src/game/logistics/expansion.ts` owns depot/outpost/storage-upgrade planning, storage diagnostics, and the storage-expansion cache.

The facade re-exports the current public types and functions so existing engine, component, and test imports do not need a broad migration. Internal modules may consume narrow helpers from sibling modules, but expansion must not reach back into the engine.

### Serialization

`src/game/serialization.ts` remains the public save envelope API and composition layer:

- `src/game/serialization/validation.ts` owns primitive predicates and version-specific structural validation for cells, buildings, dwarves, orders, access requests, worlds, and complete simulation states.
- `src/game/serialization/migrations.ts` owns normalization, safety defaults, schema-version migration, generated-stockpile recovery, and access-order repair coordination.

Serialization modules may depend on `types.ts`, `content.ts`, `generation.ts`, `buildings.ts`, and the logistics recovery API. They must not depend on engine orchestration or UI code.

## Public API and data flow

Callers continue to use `stepSimulation`, `serializeState`, `parseSave`, and the existing logistics exports from their current paths. The top-level modules delegate to focused implementations and re-export types/functions where necessary. The only data flow change is compile-time ownership; runtime state transitions and JSON output remain identical.

## Testing strategy

- Run the existing full suite before and after extraction as the primary behavior contract.
- Add focused tests for extracted pure boundaries where existing tests currently cover only the facade, especially targeting tie-breaks, access-request lifecycle, recovery transitions, storage capacity decisions, dig-safety cache reuse, migration selection, and validation rejection.
- Add a module-boundary smoke check through the existing public imports to ensure the facades remain usable.
- Run deterministic generated-world/liveness coverage already present in the repository.
- Verify `npm test -- --run`, `npm run lint`, `npm run build`, and `git diff --check` before opening the PR.

## Documentation

Update `README.md`'s architecture section with the new subsystem boundaries and the rule that top-level game modules are orchestration/facade surfaces. Do not document internal implementation details that would prevent future movement of private helpers.

## Non-goals

- No new gameplay mechanics, policies, save fields, migrations, or UI behavior.
- No changes to pathfinding algorithms or cache key definitions except relocation with behavior-preserving tests.
- No broad renaming of domain concepts unrelated to the decomposition.

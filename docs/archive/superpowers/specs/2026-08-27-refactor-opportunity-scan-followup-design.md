# Refactor Opportunity Scan Follow-up Design

**Issue:** #40

## Goal

Consolidate duplicated simulation and presentation-derived logic, and decompose the remaining concentrated modules into focused units without changing simulation behavior, persistence, cache semantics, or public imports.

## Constraints and invariants

- `stepSimulation` remains the public engine entry point and preserves tick ordering, sequential dwarf claims, world replacement, progress accounting, and completion detection.
- Existing top-level facades (`buildings.ts`, `logistics.ts`, `serialization.ts`, and `pathfinding.ts`) remain import-compatible for current consumers.
- Construction reservations, carried cargo, storage capacity, and recovery returns remain conservation-safe.
- Pathfinding caches remain scoped by immutable `World` identity and retain origin, destination, and virtual-cleared-cell inputs.
- Save schema version and parse/migration behavior remain unchanged.
- The simulation remains renderer-independent; UI helpers may consume domain selectors but domain code must not import React components.

## Architecture

### Shared domain helpers

Create narrow helpers for storage insertion, recovered-order cleanup, adjacent-path enumeration, and mineable-cell counting. Keep mutation ownership in the domain module that already owns the relevant state transition, and preserve existing facade exports by delegating to the helpers.

### Target selection

Extract one ranked work-candidate pipeline from `chooseTarget` and `findUnsafeTarget`. The shared pipeline owns reservations, bootstrap filtering, reachable-target mapping, scoring, and ordering. Each public selector only applies its safety predicate and result shape.

### Expansion

Separate expansion order planning from storage diagnostics. Shared candidate enumeration and planned-building/order construction must be pure with respect to their inputs and must not alter the existing eligibility or cache-key semantics. Diagnostics continue to explain the first failing gate rather than calling planner functions with side effects.

### Engine advancement

Keep `engine.ts` as the tick orchestrator and safety-state coordinator. Move task advancement into focused handlers for idle assignment, movement, construction delivery, digging, and hauling. Handlers return the existing `AdvanceResult` shape so the sequential dwarf loop remains the only place that merges world, inventory, order, safety, and progress changes.

### Save validation

Split primitive predicates, entity validators, and cross-record simulation invariants behind the current validation exports. `isSimulationState(value, allowOrphanedAccessOrders)` remains the single public state validator and retains the optional migration-repair mode.

### Tests and UI derivation

Move tests alongside the responsibilities they exercise, retaining scenario coverage and shared fixtures only where they represent real domain setup. Reuse `countSolids` or a boolean companion in HUD, Inspector, safety observation, and completion logic.

## Error and compatibility behavior

No error strings, serialized fields, task shapes, order reasons, or safety reasons change. Invalid paths, stale tasks, missing storage, unreachable construction, and malformed saves continue to return the same observable results. New helpers remain internal unless a current facade needs to expose them.

## Verification strategy

Before each extraction, add or preserve a behavior-level assertion for the affected public path. Run focused tests after each subsystem, then run the complete serialized Vitest suite, typecheck, lint, build, and `git diff --check`. Review imports to ensure focused modules do not reach back through their own facade and inspect the final diff for unrelated changes.

## Deliberate non-goals

- No gameplay balancing or policy redesign.
- No cache algorithm redesign or renderer optimization.
- No save-schema migration.
- No unrelated mobile/UI redesign.

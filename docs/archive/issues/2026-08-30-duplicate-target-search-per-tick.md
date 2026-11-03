# Consolidate duplicate target-search work inside each simulation tick

Severity: medium

## Problem

The engine computes similar per-dwarf candidate sets more than once in the same tick.

Evidence:

- `src/game/engine/accessRequests.ts` loops through idle dwarves and calls `findUnsafeTarget` while planning access requests.
- `src/game/engine/idleAdvancement.ts` later calls `chooseAccessTarget` and `chooseTarget` for idle dwarves again.
- Both flows depend on the same targeting and safety logic.

This duplicates reachable-target discovery, sorting, and safety checks in a hot loop.

## Scope

- Identify the shared per-dwarf candidate data needed by both access planning and idle assignment.
- Compute that data once per dwarf per tick, or otherwise share the result across both phases.
- Keep access-request behavior and work selection behavior unchanged from a gameplay perspective.
- Add tests around behavioral equivalence and any new planner boundary.

## Acceptance criteria

- The engine no longer recomputes the same ranked or reachable work surface twice for the same dwarf in one tick.
- Access planning and idle assignment read from a shared result or explicit planner boundary.
- Existing engine and logistics tests remain green.
- New coverage protects the shared computation boundary from regressions.

## Notes

Suggested labels: `performance`, `engine`, `maintainability`

# Shared Per-Tick Target Planner Design

## Goal

Consolidate the target-surface work used by access-request planning and idle dwarf assignment so each dwarf's reachable, enriched, and work-ranked candidates are derived once per simulation tick, without changing persisted simulation state or gameplay decisions.

## Context

`planAccessRequests` currently calls `findUnsafeTarget`, while `advanceIdle` later calls `chooseAccessTarget` and `chooseTarget`. These functions each start from reachable exposed solids and repeat candidate enrichment and ordering work. The existing topology cache prevents some pathfinding duplication, but it does not provide an explicit boundary for sharing the enriched/ranked candidate surface across the phases.

## Design

Add an ephemeral `TargetPlanningContext` in `src/game/engine/targeting.ts`. The context is created at the beginning of `stepOnce`, after stale-order recovery and before access planning. For each dwarf and position, it lazily stores one enriched candidate surface containing the reachable target, path, stand position, and work score, plus a work-ranked view of that surface. The context is not part of `SimulationState`, serialization, or save data.

The work-target APIs will accept an optional context. `findUnsafeTarget` and `chooseTarget` will reuse the context's work-ranked candidates, applying current reservation and bootstrap-protection filters at the point of use. `chooseAccessTarget` will reuse the same enriched reachable candidates while retaining its request-distance ordering. `reopenResolvedAccessRequests` will also read the shared reachable surface. Safety is still evaluated against the current state at the point of assignment; this preserves behavior when earlier dwarves change reservations or helper availability during the assignment loop.

`stepOnce` passes the same context to `planAccessRequests` and `advanceDwarf`/`advanceIdle`. Existing public call sites and tests remain compatible because the context parameter is optional and standalone calls create a local context. The safety observation after advancement gets a fresh context if needed because digging can change the world during the tick.

## Behavioral guarantees

- Candidate scoring and work ranking retain the existing comparator and policy rules.
- Reservation and bootstrap-protection filtering remains state-sensitive and occurs at the same decision point.
- Access-request priority and request-distance ordering are unchanged.
- Dig-safety checks use the current state rather than a stale pre-assignment snapshot.
- No save schema or public simulation-state shape changes.

## Testing

Add targeting tests that prove a context returns a stable shared snapshot for repeated consumers and that its work-ranked view preserves existing candidate ordering. Add an engine-level equivalence test that runs the access-planning and idle-assignment boundary with and without an explicit context and compares the resulting state/dwarf decisions. Keep the existing engine, logistics, typecheck, lint, build, and diff checks green.

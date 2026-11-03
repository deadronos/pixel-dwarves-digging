# Decouple navigation cache invalidation from inventory-only world updates

Severity: high

## Problem

Pathfinding and targeting caches are keyed off `World` object identity. Storage inventory updates rebuild the full world object even when terrain, buildings, and walkability are unchanged.

Evidence:

- `src/game/pathfinding.ts` defines `navigationIndexCache`, `searchCache`, and `pathCache` as `WeakMap<World, ...>` caches.
- `src/game/engine/targeting.ts` defines `reachableWorkCache` as a `WeakMap<World, ...>`.
- `src/game/buildings/storage.ts` returns a new `world` object from `addMaterialToStorage` and `removeFromStorage` during inventory-only mutations.

This causes avoidable cache churn after hauling and storage updates.

## Scope

- Separate topology identity from inventory identity for navigation-related caches.
- Preserve cache reuse across storage mutations that do not change traversability.
- Keep cache invalidation correct when cells, ladders, bridges, or building placement actually change.
- Add tests that distinguish inventory-only updates from topology-changing updates.

## Acceptance criteria

- Inventory-only storage mutations do not evict pathfinding or reachable-work caches.
- Topology changes still invalidate caches deterministically.
- Pathfinding behavior remains correct after storage updates, construction completion, and digging.
- Tests cover at least one cache reuse case and one invalidation case.

## Notes

Possible approaches:

- Introduce a topology revision or navigation snapshot key.
- Move non-topology state out of the cache key path.

Suggested labels: `performance`, `pathfinding`, `architecture`

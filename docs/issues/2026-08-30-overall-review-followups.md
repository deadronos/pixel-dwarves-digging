# Overall review follow-up issues

The 2026-08-30 overall review produced five follow-up issues across correctness, maintainability, reuse, and performance:

1. Dirty save status is not set correctly for policy and material-priority updates.
2. Pathfinding and targeting caches are invalidated by inventory-only world updates.
3. Access planning and idle assignment duplicate target-search work in the same tick.
4. HUD and Inspector derive overlapping state directly from the full simulation object.
5. Performance tests log timings but do not enforce regression guards.

## Scope

- Fix the store-level save status bug and add regression tests.
- Preserve navigation cacheability across storage inventory mutations that do not change walkability.
- Consolidate per-dwarf candidate evaluation so access planning and idle assignment share the same work product.
- Extract reusable selectors or view models for the live UI panels and add focused coverage.
- Turn existing benchmarks into automated regression protection with deterministic checks or coarse budgets.

## Suggested issue split

- `docs/issues/2026-08-30-save-status-dirty-state.md`
- `docs/issues/2026-08-30-cache-invalidation-topology-vs-inventory.md`
- `docs/issues/2026-08-30-duplicate-target-search-per-tick.md`
- `docs/issues/2026-08-30-ui-derived-state-selectors.md`
- `docs/issues/2026-08-30-performance-regression-guards.md`

## Acceptance criteria

- Each issue has a clear owner-facing problem statement, scope, and acceptance criteria.
- The resulting implementation order starts with correctness, then cache and engine architecture, then UI reuse, then benchmark hardening.
- Existing unit coverage remains green after each issue is addressed.

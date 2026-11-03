# Extract reusable derived-state selectors for live HUD and Inspector panels

Severity: medium

## Problem

The live UI panels subscribe to the full simulation object and recompute overlapping summary data in component render paths.

Evidence:

- `src/components/Hud.tsx` reads `simulation` directly and derives remaining solids and aggregate inventory.
- `src/components/Inspector.tsx` reads `simulation` directly and derives remaining solids, storage diagnostics, counts, and progress.
- The same domain summaries are useful outside the current component tree but are not exposed as reusable selectors or view models.

This increases render-time work, duplicates domain summarization logic, and makes UI coverage harder to target.

## Scope

- Extract shared selectors or view-model helpers for HUD and Inspector summaries.
- Narrow Zustand subscriptions to only the data each component needs.
- Reduce repeated array scans and duplicate derivations in render paths.
- Add focused tests for the extracted selectors or the rendered panel summaries.

## Acceptance criteria

- HUD and Inspector no longer depend on the full simulation object when narrower selections are sufficient.
- Shared derived data lives in reusable, testable helpers.
- Rendered panel behavior remains unchanged.
- Tests cover the extracted summary logic or component output.

## Notes

Suggested labels: `refactor`, `ui`, `state-management`

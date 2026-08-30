# Fix dirty save status for policy updates

Severity: high

## Problem

The store setters for policy and material priority write `saveStatus: 'DIRTY'` inside the `simulation` object instead of the root store state.

Evidence:

- `src/game/state.ts` `setPolicy`
- `src/game/state.ts` `setMaterialPriority`
- `src/components/Hud.tsx` reads the top-level `saveStatus`

This creates two risks:

1. The UI can report an incorrect save state after policy changes.
2. The simulation object can accumulate a stray `saveStatus` field that does not belong to the serialized domain model.

## Scope

- Update the affected setters so `saveStatus` is set at the root store level.
- Confirm the `simulation` object shape stays domain-only.
- Add regression coverage for both `setPolicy` and `setMaterialPriority`.
- Verify the existing dirty-state behavior for `tickSimulation` and `setConstructionPolicy` remains unchanged.

## Acceptance criteria

- Changing work preference marks the top-level store `saveStatus` as `DIRTY`.
- Changing hauling preference marks the top-level store `saveStatus` as `DIRTY`.
- Changing material priority marks the top-level store `saveStatus` as `DIRTY`.
- No stray `saveStatus` field is added under `simulation`.
- State-store tests cover the regression path.

## Notes

Suggested labels: `bug`, `state-management`, `save-system`

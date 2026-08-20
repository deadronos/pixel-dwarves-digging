# Critical/high remediation issue

The 2026-08-20 in-depth review found four critical/high failures:

1. Fresh generated worlds can deadlock in bootstrap. A 200-seed sweep left 47 seeds (23.5%) at zero cleared blocks after 300 ticks; affected runs have no reachable safe starter work.
2. Multiple dwarves can claim one reserved construction unit. One-stone ladder orders can complete once while extra carried units disappear.
3. Local saves are written but not restored during app startup. Reloading starts a new random run even though the saved payload remains in local storage.
4. Save parsing accepts semantically invalid nested records such as unknown building types, negative dimensions/capacities, and empty dwarf objects.

## Scope

- Guarantee a supported, reachable starter corridor and add generated-seed viability regression coverage.
- Prevent builder assignment from exceeding reserved material and preserve finite-resource accounting.
- Restore the latest valid local save before starting the fixed simulation interval and expose a correct saved/dirty state.
- Validate nested save discriminated unions, numeric bounds, coordinates, and cross-record references.

## Acceptance criteria

- 200 deterministic fresh seeds complete the bounded bootstrap viability check without a permanently idle bootstrap state.
- A one-unit construction order cannot be claimed by more than one dwarf, and no carried material disappears when an order completes or is invalidated.
- A saved run survives a browser reload and resumes from the saved seed/tick; invalid local saves fall back to a new run with a visible error state.
- Malformed cells, buildings, dwarves, tasks, inventories, construction orders, and access requests are rejected by `parseSave` with a user-facing error.
- Existing behavior remains covered by the full unit suite; typecheck, lint, build, and browser smoke all pass.

The full evidence report is in `docs/reviews/2026-08-20-indepth-review.md`.

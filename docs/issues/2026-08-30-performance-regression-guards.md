# Turn existing performance benchmarks into regression guards

Severity: medium

## Problem

The repository already includes performance-oriented tests, but they only print timings instead of enforcing guardrails.

Evidence:

- `src/game/pathfinding.performance.test.ts` logs elapsed time for repeated route queries.
- `src/game/logistics.performance.test.ts` logs elapsed time and average time per call for storage diagnostics.

These tests are informative during manual runs, but they do not fail when performance regresses.

## Scope

- Decide which performance expectations are stable enough for automated checks.
- Convert the current benchmarks into deterministic assertions, coarse upper bounds, or comparative invariants.
- Keep the checks robust enough to avoid flaky failures on local and CI hardware.
- Document how to run and interpret the performance coverage.

## Acceptance criteria

- At least the current pathfinding and logistics benchmark coverage provides an automated pass or fail signal.
- The checks are deterministic enough to run repeatedly without frequent noise.
- Any thresholds or invariants are documented in the test file or related docs.
- Performance regressions in these hot paths are visible without manual log inspection.

## Regression guard policy

The pathfinding benchmark runs a fixed workload of 15,360 repeated routes and
must complete in under 2,000 ms. The storage-diagnostics benchmark runs 1,000
diagnostic calls and must complete in under 500 ms. These are deliberately
coarse ceilings rather than machine-specific performance targets, leaving room
for slower CI hardware while still detecting broad regressions.

Both tests also assert deterministic workload behavior: the pathfinding route
count is fixed, and the storage benchmark verifies that the expansion result is
reused across unchanged structural state. Run the focused guards with:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/<unique-name>.localstorage' npm test -- --run src/game/pathfinding.performance.test.ts src/game/logistics.performance.test.ts --maxWorkers=1
```

Run the complete suite with the same Node local-storage option and a unique
temporary file:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/<unique-name>.localstorage' npm test -- --run --maxWorkers=1
```

## Notes

Suggested labels: `performance`, `tests`, `tooling`

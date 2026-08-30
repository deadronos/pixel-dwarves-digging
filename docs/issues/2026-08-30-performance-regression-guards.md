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

## Notes

Suggested labels: `performance`, `tests`, `tooling`

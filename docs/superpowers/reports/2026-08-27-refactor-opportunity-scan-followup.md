# Refactor Opportunity Scan Follow-up Report

Issue: #40
Branch: `codex/refactor-opportunity-scan-followup-2026-08-27`

## Implemented

- Centralized storage accounting and world mineable-solid helpers while preserving the existing building and logistics facades.
- Shared ranked work-candidate selection and adjacent-path enumeration; preserved reservation, virtual-cell, and cache semantics.
- Split construction recovery, expansion planning, and expansion diagnostics into focused logistics modules.
- Split engine task advancement into idle, build, dig, haul, movement, and dispatcher modules while keeping `stepSimulation` as the orchestration boundary.
- Split save validation into primitive, entity, and cross-record state validators behind the existing validation exports.
- Added focused behavior tests for storage helpers, target ranking, recovery cleanup, task construction/dispatch, and validation primitives.
- Preserved cell-array memoization in HUD and Inspector solid counts, and added direct boundary tests for task-handler guards, expansion helper purity, and state invariants.
- Updated the architecture documentation and routed migration recovery directly to its focused module.

## Commit sequence

- `3bdb988` docs: define refactor follow-up scope
- `4f91bfa` docs: plan refactor opportunity follow-up
- `2950c5f` refactor: share storage and world helpers
- `24d9cb9` refactor: share targeting and path helpers
- `db3e6db` refactor: split expansion and recovery logistics
- `f963665` refactor: split engine task advancement
- `b7ad5e3` refactor: split save validation responsibilities

## Verification

- `NODE_OPTIONS=--localstorage-file=<temporary-file> npm test -- --run --maxWorkers=1`: 22 files, 174 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite retained the existing large `WorldCanvas` chunk warning.
- `git diff --check`: passed.

The local-storage option is required for the current Node 26/jsdom test environment; it does not change application behavior.

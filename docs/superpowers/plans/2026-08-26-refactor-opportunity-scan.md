# Refactor Remaining Source Hotspots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the remaining simulation hotspots and consolidate repeated derived-state logic while preserving behavior.

**Architecture:** Keep public facades stable. Extract pure domain helpers first, then move orchestration into focused task modules. Preserve world-identity pathfinding caches and existing state mutation semantics. Tests move with the responsibilities they exercise.

**Tech Stack:** TypeScript, React/Zustand, Vitest, Biome, Vite.

---

### Task 1: Establish issue-linked baseline and engine boundaries

**Files:**
- Modify: `src/game/engine.ts`
- Create: `src/game/engine/safetyState.ts`, `src/game/engine/taskAdvancement.ts`, and focused task helpers as needed
- Test: `src/game/engine.test.ts` and extracted focused engine tests

- [ ] Record the current test baseline and identify tests covering safety, movement, digging, hauling, building, and recovery.
- [ ] Add one focused regression assertion for each extracted public behavior before moving implementation.
- [ ] Move safety observation and blocked-state classification into a pure helper without changing outcomes.
- [ ] Move per-dwarf dispatch and task-specific transitions behind a stable engine facade.
- [ ] Run focused engine tests, then the complete test suite.

### Task 2: Separate building placement, storage, and construction

**Files:**
- Modify: `src/game/buildings.ts`
- Create: `src/game/buildings/placement.ts`, `src/game/buildings/storage.ts`, `src/game/buildings/construction.ts`
- Test: `src/game/buildings.test.ts`

- [ ] Add focused tests for placement rejection/anchors, storage accounting, and construction completion.
- [ ] Extract placement geometry and keep the existing facade exports.
- [ ] Extract storage inventory mutations and selectors.
- [ ] Extract reservation, delivery, and completion transitions.
- [ ] Run building and engine tests after each extraction.

### Task 3: Split pathfinding internals

**Files:**
- Modify: `src/game/pathfinding.ts`
- Create: `src/game/pathfinding/geometry.ts`, `src/game/pathfinding/search.ts`, `src/game/pathfinding/exposedSolids.ts`
- Test: `src/game/pathfinding.test.ts`

- [ ] Add regression coverage for virtual cleared-cell routing and cache-key separation.
- [ ] Move geometry and movement predicates without changing diagonal or ladder semantics.
- [ ] Move BFS/search caches and path reconstruction while preserving WeakMap world identity.
- [ ] Move reachable exposed-solid discovery behind the facade.
- [ ] Run pathfinding, logistics, and engine tests.

### Task 4: Split serialization validation and derived logistics eligibility

**Files:**
- Modify: `src/game/serialization/validation.ts`, `src/game/logistics/expansion.ts`
- Create: `src/game/serialization/validation/primitives.ts`, `src/game/serialization/validation/invariants.ts`, `src/game/logistics/expansionEligibility.ts`
- Test: `src/game/serialization.test.ts`, `src/game/logistics.test.ts`

- [ ] Add focused validation tests for malformed leaves and cross-record orphan/duplicate invariants.
- [ ] Extract primitive validators and state-level invariants behind the existing exports.
- [ ] Add planner/diagnostic assertions that share identical eligibility facts.
- [ ] Extract a pure eligibility observation used by expansion planners and diagnostics.
- [ ] Run serialization and logistics tests.

### Task 5: Reorganize tests and verify the branch

**Files:**
- Modify: `src/game/engine.test.ts`, `src/game/logistics.test.ts`
- Create: focused test files and shared fixtures only where duplication is demonstrated

- [ ] Split tests by responsibility without weakening assertions.
- [ ] Remove only redundant setup duplication; preserve scenario-specific fixtures.
- [ ] Run `NODE_OPTIONS='--localstorage-file=/tmp/refactor-opportunity-vitest.localstorage' npm test -- --run`.
- [ ] Run `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Review the final diff, commit the implementation, push the branch, and open a PR referencing issue #38.

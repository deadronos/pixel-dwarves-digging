# Issue 10 Pathfinding Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeated pathfinding overhead in the simulation while preserving grounded movement, ladder rules, virtual dig overrides, and shortest-path results.

**Architecture:** Treat `World` identity as the simulation revision boundary, matching the existing planner caches. Cache the navigation occupancy index and BFS search result by world, origin, and virtual-cleared cell; cache exact reconstructed paths separately so repeated storage and adjacent-route queries avoid duplicate work without changing returned routes.

**Tech Stack:** TypeScript, Vitest, Vite, Biome.

---

### Task 1: Establish failing performance-regression tests

**Files:**
- Modify: `src/game/pathfinding.test.ts`
- Create: `src/game/pathfinding.performance.test.ts`

- [x] **Step 1: Add a failing cache-observable test**

  Add a test that calls `findPath` twice with the same world, origin, destination, and virtual-cleared cell and asserts the two returned path arrays are the same reference. Add a second query from the same origin to another destination and assert its route remains the expected shortest path.

- [x] **Step 2: Add a deterministic stress benchmark**

  Create a fixed 160 × 80 grounded corridor world with 24 valid dwarf origins and 32 reachable destinations. Run 20 rounds of all origin/destination queries, assert every result is non-null and shortest-path-shaped, and report the elapsed milliseconds in the test output. Keep the benchmark deterministic and avoid a machine-specific hard timing threshold.

- [x] **Step 3: Run the focused tests and verify RED**

  Run:

  ```bash
  npm test -- --run src/game/pathfinding.test.ts src/game/pathfinding.performance.test.ts
  ```

  Expected: existing path correctness tests pass, while the cache-observable test fails because repeated calls currently allocate distinct path arrays. The benchmark still completes and records the baseline timing.

### Task 2: Cache navigation state, BFS searches, and exact paths

**Files:**
- Modify: `src/game/pathfinding.ts`
- Modify: `src/game/pathfinding.test.ts`

- [x] **Step 1: Build a world-identity navigation index**

  Add a `WeakMap<World, NavigationIndex>` containing typed arrays for completed floor cells and ladder cells. Populate each index once from completed buildings, and have `hasFloor`/`hasLadder` read the index instead of scanning `world.buildings` for every walkability check.

- [x] **Step 2: Cache searches by world, origin, and virtual override**

  Move the current BFS implementation into an uncached helper and add a `WeakMap<World, Map<string, SearchResult | null>>`. Key it by origin coordinates and the optional cleared-cell coordinates. Reuse the cached search in `findPath` and `findReachableExposedSolids`; never share a cache entry across different world identities or cleared cells.

- [x] **Step 3: Cache exact reconstructed paths without changing callers**

  Add a path cache keyed by world, origin, destination, and virtual override. Return the cached path array for repeated exact queries, while keeping all existing callers read-only with respect to the returned path.

- [x] **Step 4: Run focused tests and verify GREEN**

  Run:

  ```bash
  npm test -- --run src/game/pathfinding.test.ts src/game/pathfinding.performance.test.ts
  ```

  Expected: all path correctness tests and the cache-observable test pass, with the benchmark reporting a lower or stable elapsed time than baseline.

### Task 3: Verify simulation behavior and handoff

**Files:**
- Modify: `README.md` only if the benchmark/tick-budget target needs documentation.

- [x] **Step 1: Run the complete verification suite**

  Run:

  ```bash
  npm run typecheck
  npm run lint
  npm test -- --run
  npm run build
  git diff --check
  ```

- [x] **Step 2: Review and commit**

  Inspect `git diff`, then commit:

  ```bash
  git add -A
  git commit -m "perf: cache repeated pathfinding work"
  ```

- [ ] **Step 3: Push the branch and open a PR for issue #10 if requested**

  Push `codex/issue-10-pathfinding-performance` and open a draft PR whose body explains the repeated BFS/building scans, the world-identity caches, benchmark evidence, and all verification commands. Include `Fixes #10` when PR handoff is requested.

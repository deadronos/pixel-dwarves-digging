# Performance Regression Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing pathfinding and storage-diagnostics benchmarks into deterministic, documented pass/fail regression guards.

**Architecture:** Keep the benchmark workloads unchanged so their operation counts remain fixed, then add deliberately coarse elapsed-time budgets that catch major regressions without depending on a narrow machine-specific baseline. Document the commands, counts, and budget rationale next to the issue specification; do not add production instrumentation or alter simulation behavior.

**Tech Stack:** TypeScript, Vitest, Node `performance.now()`.

---

### Task 1: Guard the pathfinding benchmark

**Files:**
- Modify: `src/game/pathfinding.performance.test.ts`

- [ ] **Step 1: Write the failing guard**

After the existing `routeCount` assertion, define a coarse budget near the test constants and assert the measured elapsed time is below it:

```ts
const PATHFINDING_BUDGET_MS = 2_000
// This is intentionally much higher than the local baseline to tolerate CI hardware.
expect(elapsed).toBeLessThan(PATHFINDING_BUDGET_MS)
```

Run the focused benchmark before implementation to confirm the existing workload completes under the budget and record the printed `routes` count and timing as the baseline.

- [ ] **Step 2: Verify the focused benchmark**

Run:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue46-pathfinding.localstorage' npm test -- --run src/game/pathfinding.performance.test.ts --maxWorkers=1 --reporter=verbose
```

Expected: one passing test, `routes` equal to `24 * 32 * 20` (15,360), and elapsed time below 2,000 ms.

- [ ] **Step 3: Commit the pathfinding guard**

```bash
git add src/game/pathfinding.performance.test.ts
git commit -m "test: guard repeated pathfinding performance"
```

### Task 2: Guard the logistics benchmark

**Files:**
- Modify: `src/game/logistics.performance.test.ts`

- [ ] **Step 1: Write the failing guard**

After the existing `diagnosticCount` assertion, define a coarse budget and assert elapsed time:

```ts
const STORAGE_DIAGNOSTICS_BUDGET_MS = 500
// This is intentionally much higher than the local baseline to tolerate CI hardware.
expect(elapsed).toBeLessThan(STORAGE_DIAGNOSTICS_BUDGET_MS)
```

Keep the existing `initialExpansion` identity assertion; it is the deterministic cache-reuse guard, while the elapsed budget catches broad regressions.

- [ ] **Step 2: Verify the focused benchmark**

Run:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue46-logistics.localstorage' npm test -- --run src/game/logistics.performance.test.ts --maxWorkers=1 --reporter=verbose
```

Expected: one passing test, `iterations` equal to 1,000, and elapsed time below 500 ms.

- [ ] **Step 3: Commit the logistics guard**

```bash
git add src/game/logistics.performance.test.ts
git commit -m "test: guard storage diagnostics performance"
```

### Task 3: Document and validate the guard policy

**Files:**
- Modify: `docs/issues/2026-08-30-performance-regression-guards.md`

- [ ] **Step 1: Document commands and threshold rationale**

Add a “Regression guard policy” section stating that the pathfinding workload must execute 15,360 routes under 2,000 ms and the storage workload must execute 1,000 diagnostics under 500 ms. Explain that both limits are coarse CI-safe ceilings, while route/iteration counts and storage expansion identity provide deterministic workload/cache assertions. Include the focused command and the full-suite command:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/<unique-name>.localstorage' npm test -- --run src/game/pathfinding.performance.test.ts src/game/logistics.performance.test.ts --maxWorkers=1
NODE_OPTIONS='--localstorage-file=/tmp/<unique-name>.localstorage' npm test -- --run --maxWorkers=1
```

- [ ] **Step 2: Run focused and complete validation**

Run the two focused benchmark files, then:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue46-final.localstorage' npm test -- --run --maxWorkers=1
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all tests pass, both guards remain below budget, static checks succeed, and the build emits no new errors (the existing large-chunk warning is non-blocking).

- [ ] **Step 3: Commit documentation and verify the branch**

```bash
git add docs/issues/2026-08-30-performance-regression-guards.md
git commit -m "docs: explain performance regression guard policy"
git status --short --branch
git log --oneline -4
```

Confirm only the two benchmark tests and the issue documentation changed, then open a draft PR linked to issue 46 with the focused and full validation commands in its test plan.

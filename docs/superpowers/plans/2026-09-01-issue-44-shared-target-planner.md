# Shared Per-Tick Target Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share each dwarf's enriched reachable and work-ranked target surface between access planning and idle assignment within one simulation tick.

**Architecture:** Add an ephemeral `TargetPlanningContext` to the targeting seam. It lazily computes each dwarf's enriched candidates and work-ranked view once, while consumers retain state-sensitive reservation filtering, access-request ordering, and current-state safety checks. Thread the optional context through access planning and dwarf advancement without changing `SimulationState` or save data.

**Tech Stack:** TypeScript, Vitest, Vite, Biome.

---

### Task 1: Add the shared targeting boundary

**Files:**
- Modify: `src/game/engine/targeting.ts`
- Test: `src/game/engine/targeting.test.ts`

- [ ] **Step 1: Write the failing boundary test**

Add a test that creates one context, asks for the same dwarf's planning snapshot twice, and asserts the snapshot and both candidate views are reused. Also assert that the work view remains score-descending and includes the same enriched target/path/stand data as the reachable view.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/game/engine/targeting.test.ts`

Expected: FAIL because `createTargetPlanningContext` and its snapshot accessor do not exist.

- [ ] **Step 3: Implement the minimal context**

In `targeting.ts`, define `TargetPlanningSnapshot` and `TargetPlanningContext`, add `createTargetPlanningContext(state)`, and lazily build one enriched candidate array per dwarf-position key. Build the work-ranked copy with the existing score comparator. Update `rankedWorkCandidates` to use the context's work view while retaining current reservation and bootstrap filters. Update `chooseTarget`, `findUnsafeTarget`, and `chooseAccessTarget` to accept and consume the optional context; return their existing result shapes explicitly.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --run src/game/engine/targeting.test.ts`

Expected: PASS for all targeting tests, including the new context-reuse boundary.

- [ ] **Step 5: Commit the targeting boundary**

Run:

```bash
git add src/game/engine/targeting.ts src/game/engine/targeting.test.ts
git commit -m "perf: add shared per-tick target planning context"
```

### Task 2: Thread the context through access planning and idle assignment

**Files:**
- Modify: `src/game/engine/accessRequests.ts`
- Modify: `src/game/engine/idleAdvancement.ts`
- Modify: `src/game/engine/advancement.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/engine.test.ts`

- [ ] **Step 1: Write the failing integration/equivalence test**

Add a test fixture with an unsafe exposed target and an access request, then compare the results of the access-planning plus idle-assignment boundary when passed one explicit context versus when each consumer creates its own context. Assert equal access requests and equal dwarf task assignments.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/game/engine.test.ts`

Expected: FAIL because the phase functions do not yet accept or forward a shared context.

- [ ] **Step 3: Thread the optional context**

Add optional `TargetPlanningContext` parameters to `reopenResolvedAccessRequests`, `planAccessRequests`, `advanceIdle`, and `advanceDwarf`. Create one context in `stepOnce` before access planning, pass it through access planning and every dwarf advancement, and keep standalone callers backward-compatible by creating a context when omitted. Use the context for resolved-request reopening as well as new unsafe-request detection.

- [ ] **Step 4: Run focused tests and verify behavior**

Run: `npm test -- --run src/game/engine.test.ts src/game/engine/targeting.test.ts`

Expected: PASS with the new equivalence coverage and all existing engine/targeting behavior unchanged.

- [ ] **Step 5: Commit the phase integration**

Run:

```bash
git add src/game/engine/accessRequests.ts src/game/engine/idleAdvancement.ts src/game/engine/advancement.ts src/game/engine.ts src/game/engine.test.ts
git commit -m "perf: reuse target planning across engine phases"
```

### Task 3: Validate the complete issue scope

**Files:**
- No additional files expected unless validation exposes a targeted regression.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test -- --run`

Expected: all test files and tests pass with zero failures.

- [ ] **Step 2: Run repository static checks and build**

Run: `npm run typecheck && npm run lint && npm run build && git diff --check`

Expected: each command exits successfully without new diagnostics.

- [ ] **Step 3: Review the final diff against issue #44**

Run: `git diff origin/main...HEAD --stat && git diff origin/main...HEAD`

Confirm the diff only changes the targeting boundary, its phase plumbing, and focused tests/docs; confirm no simulation-state or save-schema changes were introduced.

- [ ] **Step 4: Commit any targeted validation correction**

If validation identifies a regression, add a focused failing test first, implement the smallest correction, rerun the focused and complete checks, and commit with a terse issue-specific message.

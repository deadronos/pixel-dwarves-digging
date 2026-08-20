# Critical/high remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed bootstrap deadlock, construction resource leak, startup save loss, and unsafe save acceptance.

**Architecture:** Preserve the renderer-independent simulation core. Put starter viability in deterministic generation, derive builder claims from existing dwarf task state, load persistence at the app/store boundary, and keep semantic validation at the serialization boundary.

**Tech Stack:** TypeScript, Vitest, Zustand, React, Vite, Playwright CLI.

---

### Task 1: Publish the issue and create the issue branch

**Files:**
- Read: `docs/issues/2026-08-20-critical-high-remediation.md`
- Read: `docs/reviews/2026-08-20-indepth-review.md`

- [ ] Create the GitHub issue from the issue body file and record its number.
- [ ] Create `codex/issue-<number>-remediate-critical-high` from the current reviewed branch so the evidence report remains available.
- [ ] Confirm the new branch is clean before test-first edits.

Commands:

```bash
gh issue create --repo deadronos/pixel-dwarves-digging \
  --title "Remediate bootstrap deadlock and state integrity failures" \
  --body-file docs/issues/2026-08-20-critical-high-remediation.md
git switch -c codex/issue-9-remediate-critical-high
git status --short --branch
```

### Task 2: Lock down generated starter viability

**Files:**
- Test: `src/game/generation.test.ts`
- Modify: `src/game/generation.ts:76-136`

- [ ] Add a failing test that generates 200 deterministic seeds, steps each run for 300 ticks, and expects each run to clear at least one block or explicitly enter a recoverable blocked state; also assert the starter position and side vein are reachable in a direct pathfinding probe.
- [ ] Run `npm test -- --run src/game/generation.test.ts src/game/engine.test.ts` and confirm the new test fails on the current uneven-pocket implementation.
- [ ] Change `carveStarterPocket` so the pocket floor under every walkable starter cell is solid and the pocket includes a supported side corridor to the guaranteed stone vein.
- [ ] Run the focused tests and confirm the 200-seed test passes.
- [ ] Run the original `cavern-8459` probe and confirm `totalCleared > 0` after the bounded run.

### Task 3: Make construction material assignment transactional

**Files:**
- Test: `src/game/engine.test.ts`
- Modify: `src/game/engine.ts:311-366`, `src/game/engine.ts:595-664`, `src/game/engine.ts:763-806`
- Modify: `src/game/types.ts` only if an optional persisted claim field is necessary

- [ ] Add a failing test with three idle dwarves and one order requiring/reserving one stone; assert only one dwarf receives the build task and the order completes without material loss.
- [ ] Add a failing test for an invalidated build task with carried material; assert the material returns to global inventory.
- [ ] Run `npm test -- --run src/game/engine.test.ts` and confirm both tests fail for the current shared-reservation behavior.
- [ ] Implement a derived active-claim count from dwarves whose task matches the order and whose carried material matches the required material.
- [ ] Make `chooseBuildOrder` require `reserved - activeClaims > 0`.
- [ ] When an order is missing or invalid at delivery, return the carried unit to `state.inventory` rather than clearing it.
- [ ] Run focused engine tests and confirm inventory and order counts are exact.

### Task 4: Restore saves during startup and mark changes dirty

**Files:**
- Test: `src/game/state.test.ts`
- Modify: `src/game/state.ts:106-199`
- Modify: `src/App.tsx:8-16`

- [ ] Add a failing store test with mocked local storage containing a serialized run; assert the startup/load action replaces the initial random run before ticking.
- [ ] Add a failing test that advances the simulation after `saveLocally` and expects `saveStatus` to become `DIRTY`.
- [ ] Run `npm test -- --run src/game/state.test.ts` and confirm the tests fail before implementation.
- [ ] Add a startup-safe load action or initialization path that invokes `loadLocalSave` once before `startSimulation`.
- [ ] Update mutation paths that change serialized simulation state to mark the state dirty after the current saved snapshot diverges.
- [ ] Keep invalid local storage recoverable by preserving the new-run fallback and setting `saveError`/`saveStatus` without throwing.
- [ ] Run focused store tests, then verify the browser save/reload flow with Playwright.

### Task 5: Add semantic save validation

**Files:**
- Test: `src/game/serialization.test.ts`
- Modify: `src/game/serialization.ts:23-233`

- [ ] Add failing parser tests for an unknown building type, negative footprint/storage values, invalid cell/block values, malformed dwarf/task records, invalid inventory values, and an order referencing a missing building.
- [ ] Run `npm test -- --run src/game/serialization.test.ts` and confirm the malformed payloads are currently accepted.
- [ ] Implement small domain validators returning boolean type guards; validate dimensions/coordinates before indexing; validate references after the arrays are parsed.
- [ ] Preserve schema 1/2/3 migration behavior and normalize optional legacy fields before semantic validation.
- [ ] Run focused serialization tests and confirm every malformed fixture returns `Save file is missing required simulation data.`.

### Task 6: Full verification and handoff

**Files:**
- Modify: `README.md` only if startup save behavior needs documentation correction.
- Update: `docs/issues/2026-08-20-critical-high-remediation.md` with verification results.

- [ ] Run `npm test -- --run` and confirm all tests pass.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Run the 200-seed × 300-tick viability sweep and the one-unit construction accounting probe.
- [ ] Start the dev server and use Playwright to verify startup, save, reload, invalid-save fallback, and absence of page errors.
- [ ] Inspect the final diff and issue-linked branch status; do not claim completion until every acceptance criterion is evidenced.

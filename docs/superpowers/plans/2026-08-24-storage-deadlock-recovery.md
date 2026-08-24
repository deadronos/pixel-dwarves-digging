# Storage Deadlock Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale unreachable construction orders from starving reachable depots and repair orphaned access orders safely during runtime and save import.

**Architecture:** Keep order recovery and material return in `src/game/logistics.ts`. Make `engine.ts` select reachable material orders instead of stopping at the first unreachable one. Let `serialization.ts` perform a narrowly scoped pre-validation repair for orphan access orders and report the repair count through the existing store save status.

**Tech Stack:** TypeScript, Vitest, existing pathfinding, construction-material return, Zustand store.

---

### Task 1: Add failing runtime regressions

**Files:**
- Modify: `src/game/engine.test.ts`
- Modify: `src/game/logistics.test.ts`

- [x] **Step 1: Add unreachable-order starvation test**

Create an unreachable `access` ladder order with available dirt before a reachable depot order with available stone. Remove the bridge and block the possible builder stands around the ladder. After one `stepSimulation` tick, assert that the dwarf is assigned to the depot order, not left on the unreachable access work.

- [x] **Step 2: Add stale access-order recovery test**

Create a planned ladder order with `reason: 'access'`, a missing `accessRequestId`, and one reserved stone. Call `recoverStaleAccessOrders` and assert that the planned building and order are removed, `state.inventory.stone` increases by one, and the stockpile receives the stone.

- [x] **Step 3: Add trimming recovery test**

Create five open access requests and a planned, reserved ladder tied to the lowest-priority request. Run one simulation tick and assert that the request, order, and planned building are removed while the reserved material is restored.

- [x] **Step 4: Run the focused tests to verify the new cases fail**

```bash
npm test -- --run src/game/engine.test.ts src/game/logistics.test.ts -t "unreachable|stale access|trim.*order"
```

Expected: the new starvation and recovery expectations fail against the current implementation.

### Task 2: Implement runtime recovery and route-aware assignment

**Files:**
- Modify: `src/game/logistics.ts`
- Modify: `src/game/engine.ts`

- [x] **Step 1: Add stale access recovery**

Implement `recoverStaleAccessOrders(state)` using the existing `returnOrderMaterials` helper. Treat missing request links, missing buildings, and planned buildings with no active builder and no reachable builder route as stale. Remove only planned buildings; preserve completed buildings. Skip recovery when material return fails.

- [x] **Step 2: Make request trimming atomic**

Have `trimOpenAccessRequests` recover orders tied to discarded requests. If recovery cannot return all material safely, keep the original state rather than leaving an orphan order.

- [x] **Step 3: Run access recovery before planning**

Call `recoverStaleAccessOrders` at the start of `stepOnce`, before request planning and capacity planning.

- [x] **Step 4: Scan material orders for a reachable builder**

Replace the single `orderNeedingMaterials` selection path with an ordered loop. For each order in the existing reason priority, reserve materials in a temporary state and continue to the next order if `chooseBuildOrder` finds no route. Commit only the first successful reservation/assignment.

- [x] **Step 5: Run focused runtime tests**

```bash
npm test -- --run src/game/engine.test.ts src/game/logistics.test.ts
```

Expected: all runtime regressions and existing tests pass.

### Task 3: Add failing save-repair and import-status regressions

**Files:**
- Modify: `src/game/serialization.test.ts`
- Modify: `src/game/state.test.ts`

- [x] **Step 1: Add orphan repair test**

Build a schema-4 payload with a planned access building/order whose request is missing. Assert `parseSave` returns the state without that building/order and reports one recovered access order.

- [x] **Step 2: Add conservation rejection test**

Build an orphan order with reserved material and a full completed stockpile. Assert `parseSave` keeps returning the existing missing-data error because safe return is impossible.

- [x] **Step 3: Add store status test**

Import a repaired payload through `createGameStore` and assert the operation succeeds with `saveStatus === 'IMPORTED WITH RECOVERY'`.

- [x] **Step 4: Run focused serialization and state tests to verify the new cases fail**

```bash
npm test -- --run src/game/serialization.test.ts src/game/state.test.ts -t "orphan|recovered|recovery"
```

Expected: the new repair and status expectations fail before implementation.

### Task 4: Implement safe import repair

**Files:**
- Modify: `src/game/serialization.ts`
- Modify: `src/game/state.ts`

- [x] **Step 1: Permit only orphan access references during pre-validation**

Add an internal validation mode that allows an access order to reference a missing request or building solely long enough for repair; all other schema and cross-record checks remain strict.

- [x] **Step 2: Repair and revalidate**

Run `recoverOrphanedAccessOrders` on the pre-validated state, then run strict validation again. Return `recoveredAccessOrders` only when the repaired state is valid.

- [x] **Step 3: Surface recovery status**

Update `importSave` to set `IMPORTED WITH RECOVERY` when the parser reports one or more repaired orders, otherwise retain `IMPORTED`.

- [x] **Step 4: Run focused save tests**

```bash
npm test -- --run src/game/serialization.test.ts src/game/state.test.ts
```

Expected: all save tests pass, including conservation rejection.

### Task 5: Full verification and branch handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-storage-deadlock-recovery.md` to mark completed steps

- [x] **Step 1: Run the complete verification matrix**

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

- [x] **Step 2: Verify the supplied save behavior**

Run a focused regression using `/Users/openclaw/Downloads/pixel-dwarves-save.json` and confirm it imports with recovery, removes the orphan access order, and can assign the reachable depot order on the next tick.

- [x] **Step 3: Inspect branch state**

```bash
git status --short --branch
git diff main...HEAD --stat
```

Confirm no diagnostic harness or temporary files remain. Leave the diagnosis branch local and unpushed unless separately requested.

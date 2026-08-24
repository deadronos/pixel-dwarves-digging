# Staged Expansion and Physical Overflow Logistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-aware staged outpost planning and autonomous physical overflow depots to prevent the reproduced storage-full deadlock.

**Architecture:** Extend the existing building/logistics model with a finite `depot` storage building. Keep planning renderer-independent: capacity orders are selected before outposts, and both require a reachable construction stand. Recover stale unreachable outpost plans before assigning builders; all material movement continues through existing reservations, hauling, and storage deposits.

**Tech Stack:** TypeScript, Zustand simulation state, Vitest, React Three Fiber building renderer, Vite.

---

### Task 1: Add failing logistics regressions

**Files:**
- Modify: `src/game/logistics.test.ts`
- Modify: `src/game/engine.test.ts`

- [ ] **Step 1: Add tests for reachable depot planning and storage routing**

Add tests that create a full stockpile with a supported, reachable adjacent depot site, assert `planOverflowDepotOrder` creates one `capacity` order with the depot footprint, and assert a completed depot is selected when the stockpile is full.

- [ ] **Step 2: Add a test for unreachable outpost recovery**

Create a planned outpost with enough stone but no path from any dwarf to an adjacent construction stand. Assert the planning step removes only that stale outpost order/building and preserves the colony inventory/material reservation.

- [ ] **Step 3: Add a test that capacity orders outrank outposts**

Create reachable capacity and outpost orders with an idle dwarf and assert the selected build order is the capacity order.

- [ ] **Step 4: Run the focused tests and verify RED**

Run `npm test -- --run src/game/logistics.test.ts src/game/engine.test.ts` and confirm the new expectations fail because the depot planner/recovery behavior does not exist yet.

### Task 2: Implement the depot domain model and planner

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/content.ts`
- Modify: `src/game/logistics.ts`
- Modify: `src/game/engine.ts`

- [ ] **Step 1: Add `depot` to the building union and content definition**

Define a 1x1, capacity-24, stone-4 depot. Reuse existing storage-building behavior and construction-order material shapes.

- [ ] **Step 2: Add route-aware construction-site helpers**

Use `findAdjacentPaths` from completed storage buildings and current dwarves. A candidate is valid only when `canPlaceBuilding` passes and at least one adjacent construction stand is reachable.

- [ ] **Step 3: Add `planOverflowDepotOrder`**

Trigger at 12 or fewer aggregate free storage slots, skip when a depot order or completed depot already exists, choose a reachable site adjacent to existing storage, and create a `reason: 'capacity'` order without reserving materials until a builder claims it.

- [ ] **Step 4: Make outpost planning route-aware**

Filter outpost candidates through the same construction-site route check instead of accepting the first placeable coordinate. Allow `balanced` and `expand` to use the staged expansion planner.

- [ ] **Step 5: Recover stale unreachable outposts**

Before creating new optional orders, remove planned outposts with no active builder and no reachable construction stand. Return any reserved/delivered material through storage-safe accounting.

- [ ] **Step 6: Order planning as capacity before outpost**

Invoke depot planning before outpost planning and rank `capacity` build orders ahead of `outpost` orders while keeping access orders first.

### Task 3: Render, inspect, and validate saves

**Files:**
- Modify: `src/components/BuildingLayer.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/game/serialization.ts` if depot-specific validation requires an explicit branch

- [ ] **Step 1: Add depot rendering and color**

Give depots a distinct storage-building color and keep their fill indicator driven by finite storage inventory.

- [ ] **Step 2: Expose depot count in the inspector**

Show completed/planned depots separately from outposts so the overflow behavior is observable.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run the two modified test files and confirm all new regressions pass.

### Task 4: Full verification and browser reproduction

**Files:**
- No source changes expected.

- [ ] **Step 1: Run `npm test -- --run`**
- [ ] **Step 2: Run `npm run typecheck`**
- [ ] **Step 3: Run `npm run lint`**
- [ ] **Step 4: Import `/Users/openclaw/Downloads/pixel-dwarves-save.json` into localhost:5173**
- [ ] **Step 5: Run at 4x long enough to cross the capacity trigger and verify a depot order is planned, reserved, delivered, and completed without an unreachable outpost plan**
- [ ] **Step 6: Review `git diff --check` and branch status**

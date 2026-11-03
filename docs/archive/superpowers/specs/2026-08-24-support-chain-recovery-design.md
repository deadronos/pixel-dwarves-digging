# Support-Chain Recovery and Diagonal Staircase Design

## Goal

Recover saves where dwarves have mined away the remaining support/anchor blocks beneath an accessible frontier, leaving only support-unsafe solids and no legal ladder or bridge placement. The recovery must preserve grounded navigation, storage-return safety, and conservation of finite materials.

The supplied save demonstrates the failure: all 38 unique reachable solids fail the support safety check, three access requests are open with `no-builder-route`, and a ladder immediately below an existing completed ladder makes the frontier actionable.

## Selected approach

Use bounded recovery with both diagonal movement/mining and emergency support-breaking drops. Keep ordinary mining conservative; these capabilities activate only when the normal safety model identifies a support-chain failure.

### Vertical infrastructure anchors

`canPlaceBuilding` will allow a ladder to anchor to an adjacent completed ladder or completed non-ladder building vertically, in addition to the existing horizontal terrain/building anchors. This permits recovery ladders directly below an existing ladder or stockpile floor without allowing ladders to float freely.

### Blocked-state access planning

When the safety phase is `blocked`, the engine will still resolve and plan access-recovery orders for existing open requests. It will not resume optional expansion planning. A planned access order must still pass normal placement, material, and stockpile-route checks.

### Diagonal movement and mining

Pathfinding will support eight-neighbor movement. Diagonal steps require:

- a walkable, supported destination;
- both cardinal side cells to be walkable, preventing movement through a clipped corner; and
- the existing vertical ladder rule for purely vertical movement.

Reachable exposed-solid discovery will include diagonal targets. Diagonal mining remains subject to `assessDigSafety`, including support and storage-route checks; it does not permit mining through solid cells or bypass return logistics. The resulting diagonal path can form a staircase through alternating supported cells.

Construction-site adjacency remains cardinal, so buildings still receive a grounded orthogonal construction stand even though builders may use diagonal paths to reach it.

### Bounded emergency drops

If clearing a target would make the dwarf's current stand unsupported, normal mining remains blocked unless all of the following hold:

1. A supported landing cell exists one or two cells below the current stand after the target is virtually cleared.
2. The landing can return to the primary storage network, or an emergency ladder plan can provide a safe return route.
3. At least one other dwarf is idle or at least one common ladder material is available outside reservations/emergency reserves.
4. The drop distance is no more than two cells.

The simulation will use the existing falling/settling behavior for the landing; it will not create arbitrary free-fall movement. A support-breaking dig will retain the existing cargo and recovery handling if the landing route later becomes invalid.

No new save schema is required. Drop eligibility is derived from the current world, dwarves, reservations, and paths.

## Data flow

1. `findReachableExposedSolids` discovers cardinal and diagonal mine targets using the eight-neighbor navigation rules.
2. `assessDigSafety` evaluates normal support/storage safety, then evaluates the bounded emergency-drop path only for support failures.
3. `chooseTarget` may select a safe diagonal target or an emergency-drop target; it never selects storage-route failures.
4. On a blocked tick, access requests are replanned before capacity planning, allowing an anchored ladder order to be created.
5. Existing task execution, fall settling, storage return, and material reservation remain the source of truth for movement and conservation.

## Safety and failure handling

- Diagonal corner clipping is rejected.
- A drop never exceeds two cells and never proceeds without a supported landing.
- Completed buildings are not removed.
- No material is dumped or destroyed; ladder material is reserved through the existing construction reservation path.
- If an emergency route becomes invalid, existing stranded/recovery behavior takes over and the state reports a recovery-related block rather than silently progressing.
- Optional expansion remains disabled while blocked.

## Verification plan

Add regressions for:

- vertical ladder anchoring below a completed ladder and stockpile;
- blocked-state planning of an open access ladder;
- diagonal pathfinding with corner blocking;
- diagonal exposed-solid discovery and safe diagonal mining;
- rejection of support-breaking digs without an idle helper/material or supported landing;
- one- and two-cell emergency drops, with a three-cell drop rejected;
- preservation of existing cardinal movement, support, storage-route, and deadlock behavior;
- a deterministic reproduction of the supplied support-chain layout that recovers by anchored ladder or diagonal staircase.

Run the full test, typecheck, lint, build, and diff-check matrix before handoff.

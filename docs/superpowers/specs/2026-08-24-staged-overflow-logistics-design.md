# Staged Expansion and Physical Overflow Logistics

## Goal

Prevent the reproduced full-storage deadlock by making expansion route-aware and adding a small, physical overflow depot that the autonomous planner can construct near the reachable logistics network.

## Scope

- Add a `depot` building with finite storage capacity and a modest stone cost.
- Plan a depot when completed storage is nearly full, before optional outpost expansion.
- Require a reachable construction stand before planning a depot or outpost.
- Recover stale planned outposts that have no reachable builder route by removing the unserviceable plan and safely returning reserved materials.
- Keep all decisions colony-wide and autonomous.
- Render and inspect depots like other storage buildings.

## Behavior

The planner evaluates access work first, then capacity work, then optional expansion. A depot is placed only on an unoccupied, supported cell adjacent to a completed storage building and reachable from that building. Its materials are reserved only after the site passes both placement and route checks. Once complete, the depot participates in normal storage destination selection, so hauled materials are physically delivered there.

An existing planned outpost with no route from any dwarf to an adjacent construction stand is considered stale. If it has no active builder, the planner removes the planned building/order and returns any reserved or delivered material to available storage when capacity exists. A future planning pass can then choose a reachable site.

`balanced` and `expand` may plan reachable outposts; `expand` remains the more permissive policy, while capacity orders outrank outposts. `conserve` continues to suppress optional orders.

## Initial tuning

- Depot: 1x1 footprint, 24 storage capacity, 4 stone.
- Trigger: 12 or fewer aggregate free storage slots.
- One depot order at a time; existing completed depots are reused before another is planned.

These values are content-level tuning, not permanent balance commitments.

## Verification

- Unit tests prove depot planning requires a reachable site, creates a capacity order, and routes storage to a completed depot.
- Unit tests prove an unreachable planned outpost is recovered without losing reserved material.
- Existing tests remain green.
- Browser smoke imports the reported save, runs at 4x, and verifies a physical depot completes while the outpost planner does not create another unreachable site.

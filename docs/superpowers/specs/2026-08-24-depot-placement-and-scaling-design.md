# Depot Placement and Scaling Design

## Goal

Improve the staged overflow logistics added for issue #21 so depot recovery remains reliable in cramped terrain and can scale beyond the first depot without creating an unbounded construction loop.

## Behavior

When available storage capacity is at or below `OVERFLOW_DEPOT_TRIGGER_CAPACITY`, the simulation may plan a depot if:

- no depot construction order is already pending;
- the colony has enough available stone;
- a valid, reachable construction site exists; and
- the capacity-based depot limit has not been reached.

Depot candidates are every perimeter cell around each storage building. For a multi-tile building, all cells along the top, bottom, left, and right edges are considered. Candidates retain deterministic storage-building and perimeter ordering, and duplicate cells are removed before placement checks.

The depot limit is defined as:

```text
maxDepots = ceil(completedStorageCapacity / completedBaseStockpileCapacity)
```

Here, `completedStorageCapacity` includes completed stockpiles and depots, while `completedBaseStockpileCapacity` includes only completed stockpiles. If no completed base stockpile exists, the planner does not create a depot. This permits one depot for the initial base, permits a second depot after the first depot expands total capacity, and remains bounded until the base stockpile capacity grows.

Existing construction priority remains unchanged: access infrastructure first, capacity depots second, and optional outposts afterward.

## Implementation boundaries

- Add a focused perimeter-candidate helper in `src/game/logistics.ts`.
- Add a focused depot-limit helper using completed storage buildings.
- Update `planOverflowDepotOrder` to use both helpers.
- Keep serialization, UI rendering, outpost planning, and material accounting unchanged.

## Testing

Add regression tests covering:

1. placement on an alternate perimeter cell of a multi-tile stockpile when the initially sampled cells are blocked;
2. first depot planning under the overflow threshold;
3. second depot planning after the first depot is completed and storage is again nearly full;
4. refusal to plan a depot after the capacity-based limit is reached; and
5. refusal to create a duplicate order while a depot is pending.

The focused logistics tests must demonstrate the new behavior before implementation and pass after implementation. Full verification remains the existing test suite, typecheck, lint, build, and `git diff --check`.

## Non-goals

- No new player-facing logistics policy UI.
- No temporary dumping or resource destruction.
- No change to outpost costs or construction priority.
- No merge of the existing draft PR.

# Pixel Dwarves Performance Optimization Design

## Goal

Improve simulation and browser responsiveness when the colony has more dwarves, faster movement, or a higher simulation speed, while preserving the existing task-selection, digging, hauling, progression, and save behavior.

The work is driven by issue #3 profiling. The current implementation measured approximately 375 ms for initial assignment with 3 dwarves and 2,957 ms with 24 dwarves. Live browser profiling also showed recurring approximately 146 ms main-thread tasks during normal simulation and a 3.6 s stall in a controlled 24-dwarf, move-speed-2 state.

## Scope and non-goals

In scope:

- Reduce repeated BFS work during exposed-block selection.
- Reuse pathfinding work when the world and start position are unchanged.
- Avoid cloning the full terrain array during movement-only ticks.
- Avoid quadratic dwarf-array replacement work.
- Prevent terrain instance derivation and DOM cell scans from rerunning when blocks did not change.
- Re-profile 1x, 2x, and 4x behavior at 3, 6, 12, and 24 dwarves.

Out of scope:

- Moving the simulation to a Web Worker.
- Changing work-policy semantics or route selection priorities.
- Adding a simulation catch-up cap unless profiling shows the optimized engine still exceeds its 4x time budget.
- Visual redesign or unrelated gameplay changes.

## Architecture

### Planner and pathfinding

Add a reachable-work traversal that performs one breadth-first traversal from a dwarf position. The traversal records distances and predecessors for walkable cells while collecting exposed solid targets. For each target, the planner can choose the shortest adjacent standing position from the same traversal and reconstruct the path only for the selected candidate.

The planner will retain the current policy scoring and reservation rules. A world-identity/start-position cache may reuse distance fields across ticks; a new world object after mining invalidates the relevant cache entry naturally. Queue traversal will use a head index rather than `shift()`.

The existing exact `findPath` API remains available for hauling and tests, but shares the efficient traversal primitives where practical.

### Simulation state updates

`stepOnce` will keep the existing world object and cell-array reference for movement, digging progress, and hauling ticks. When a block is mined, it will create the minimal required world update once and use that updated world for the haul path and subsequent dwarves in the same tick.

The dwarf loop will update a copied array by index instead of repeatedly searching by id and mapping the full array. Reservation behavior will continue to observe assignments made earlier in the same tick.

### React and R3F boundaries

Terrain derivation will remain keyed to the cell-array identity. With movement-only ticks preserving that identity, instanced terrain positions and matrices will only rebuild after a block change. Terrain components will be memoized where their props are stable.

HUD and Inspector remaining-block calculations will be memoized by the cell-array identity. Existing store behavior and displayed values remain unchanged.

## Test strategy

Add focused regression tests before implementation for:

- The reachable-work planner selecting the same target/path as the current behavior on representative worlds.
- Multiple dwarves preserving reservation behavior within a single tick.
- Movement-only ticks preserving the world and cell-array references.
- Mining changing the cell array and inventory exactly once per mined block.
- Simulation output remaining equivalent across 1x/2x/4x stepping.

Existing generation, pathfinding, engine, state, serialization, and progression tests must remain green.

## Profiling and acceptance criteria

Use the deterministic `perf-issue-3` seed and the same benchmark scenarios from issue #3. Record engine timings for initial assignment, steady movement, 20-tick and 40-tick windows, dwarf counts 3/6/12/24, move speeds 0/1/2, and simulation speeds 1x/4x.

Run the browser against the Vite dev server with `PerformanceObserver` long-task measurements in paused, 1x, and 4x states. For the combined case, load 24 idle dwarves with move speed 2 and measure animation-frame gaps and long tasks.

Target outcomes:

- 24-dwarf initial assignment under 100 ms.
- No browser long task above 50 ms in the controlled 24-dwarf, move-speed-2, 4x scenario.
- Simulation work below 25 ms per 100 ms interval at 4x.
- No regression in the existing test, typecheck, lint, or build commands.

If the targets are not met, document the remaining bottleneck before adding further architectural changes.

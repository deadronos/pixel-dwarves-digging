# Safe Access-First Mining Design

## Summary

Make deep excavation safety a first-class colony behavior. Dwarves should prefer reachable mining that preserves their support and a route back to storage. When a valuable target is unsafe, the colony should prepare access first through a supported tunnel, stair-step route, ladder, or bridge rather than mining into a shaft and abandoning the dwarf.

The design adds an indestructible bedrock floor, predictive dig safety checks, access requests, access-first construction, and recovery behavior for falling or stranded haulers. The simulation remains autonomous and renderer-independent: players choose colony-wide priorities, while the planner chooses safe work and the infrastructure required to reach deeper work.

## Goals

- Prevent dwarves from mining through the bottom of the world.
- Prevent a dwarf from accepting a dig that removes their only support.
- Prevent a dwarf from accepting a dig with no predicted route back to storage.
- Prefer safe, supported tunnel expansion over direct downward excavation.
- Turn unsafe valuable targets into deduplicated access requests.
- Build ladders and bridges before they are needed for deeper work.
- Preserve carried material and recover gracefully when a route disappears.
- Keep the behavior deterministic and testable in the pure simulation core.

## Non-goals for this pass

- Diagonal movement. A diagonal-looking route is represented by cardinal stair-step cells.
- Structural collapse or multi-block support simulation.
- Dwarf injuries, death, hunger, or morale penalties from falling.
- Player placement of individual ladder or bridge tiles.
- A fully general route-building optimizer for every possible cavern shape.

## Bedrock

Add `bedrock` as a solid, indestructible block type.

- New worlds generate a one-cell bedrock layer at `y = 0`.
- Bedrock is excluded from `MineableBlockType` and cannot receive a dig task.
- Bedrock counts as support for air cells above it.
- Completion and cleared-block totals exclude bedrock.
- Rendering gives bedrock a distinct dark color and label.
- Save migration normalizes the bottom row of existing saves to bedrock and moves the save envelope to schema version 3.

The bedrock layer guarantees that a falling dwarf can land on a supported air cell at `y = 1`, while still leaving the world clearable above the floor.

## Dig safety model

Target selection becomes a two-pass process. Every exposed target is classified by simulating the target cell becoming air before assigning a dig task.

### Safe target

A target is safe when, after clearing it:

1. The dwarf's current standing cell remains supported.
2. At least one completed storage building has capacity.
3. A grounded path exists from the dwarf's current cell to that storage building.

The first pass assigns only safe targets. Existing work preference, mineral priority, depth, and path distance rank the safe candidates.

This specifically rejects mining the block directly below a dwarf when it would open a hole beneath them. It also rejects targets whose removal would leave the dwarf holding material in a disconnected pocket.

### Access-required target

An unsafe target that is otherwise valuable becomes an access request rather than a dig task. The request records:

- the target cell,
- the safety failure, such as missing support or missing return path,
- the originating work priority,
- a candidate approach direction,
- the current world revision used for the assessment.

Requests are deduplicated by target and invalidated when the target is mined, becomes safe, or becomes unreachable for a different reason.

### Blocked target

A target is blocked when no safe tunnel, ladder, bridge, or reachable storage route can be planned. Blocked targets remain unassigned. The dwarf continues safe work elsewhere or returns to storage instead of repeatedly attempting the same unsafe dig.

## Access-first planning

When an access request exists, the planner first searches for a safe excavation route from the current reachable frontier.

Preferred route shapes are:

1. A horizontal side tunnel that preserves a supported floor.
2. A cardinal stair-step route, alternating horizontal and vertical excavation.
3. A ladder through an already-open vertical shaft with a valid wall or platform anchor.
4. A bridge across a gap where the opposite side is reachable and construction is anchored.

The route planner does not treat a solid target below the dwarf as a ladder location. It first identifies the side cells that can be safely opened. A ladder construction order is created only for an air cell that can accept a ladder and has a reachable construction route.

Access excavation uses ordinary dig tasks marked with an access purpose. The planner prioritizes these preparatory cells over unrelated deep targets but still refuses any preparatory dig that fails the safety simulation.

Construction orders created for access use the existing `reason: 'access'` category. They reserve stone before assignment, require a reachable builder route, and have priority over outpost or expansion orders under the `conserve` policy.

The deep target is released only after the access route is complete and a fresh post-dig safety check passes.

## Dwarf behavior priorities

Each idle dwarf evaluates work in this order:

1. Deliver or recover carried material.
2. Complete an assigned access construction or preparatory access dig.
3. Perform a safe ordinary mining task.
4. Help prepare an access request for a valuable unsafe target.
5. Return to storage or remain idle when no safe work exists.

The colony may continue safe mining with other dwarves while one dwarf builds access. Access orders are claimed once so several dwarves do not construct duplicate ladders for the same target.

Unsafe deep targets do not outrank safe nearby work merely because they are deeper or contain a mineral. They become eligible only after their access request has been satisfied.

## Falling and recovery

Falling remains a physical event but is no longer a terminal behavior.

- A supported dwarf whose floor is removed enters a short falling state.
- The dwarf settles on the nearest supported air cell, with bedrock providing the final fallback support.
- The dwarf's current dig or build task is cancelled after displacement.
- The dwarf immediately recalculates a route to storage.
- If storage is reachable, the dwarf returns with any carried material before accepting new work.
- If storage is not reachable, the dwarf becomes visibly stranded and creates an access request from the nearest reachable colony route.

A dwarf carrying material must never silently clear its carrying state because a haul path is missing. The material remains attached to the dwarf until it is deposited or the colony completes a recovery route.

## Planning and state changes

Add the smallest state needed to make the behavior observable and deterministic:

- A world revision or equivalent cache invalidation signal for post-dig safety results.
- An access request collection or an equivalent construction-linked request record.
- A task purpose for access excavation versus ordinary mining.
- A recovery/stranded reason that can be shown in the inspector.
- `bedrock` in the block and rendering definitions.

Existing storage, building, and construction models remain the source of truth for support and delivery. Access planning should reuse `findPath`, building placement validation, and construction material reservation rather than introducing a second movement graph.

## Simulation tick flow

The simulation tick is extended in this order:

1. Apply gravity and resolve falling dwarves.
2. Revalidate or invalidate access requests against the current world revision.
3. Evaluate carried-material recovery and storage reachability.
4. Classify exposed work as safe, access-required, or blocked.
5. Create or update access requests for valuable unsafe targets.
6. Assign access tasks before ordinary mining when the request is actionable.
7. Assign safe ordinary mining, hauling, and construction tasks.
8. Advance movement and work.
9. On mining completion, re-run the post-dig storage-path check before creating the haul task.
10. Deposit carried material and invalidate navigation/logistics caches after terrain or building changes.

No task may create a haul with an empty path unless the dwarf is already at the destination. If no valid storage destination exists, the mining task is deferred before the block is cleared.

## Policies

The existing construction policy remains colony-wide:

- `conserve`: access routes and recovery routes only.
- `balanced`: access routes first, then useful nearby infrastructure.
- `expand`: access routes first, then outposts and broader logistics expansion.

Access safety is never disabled by policy. Policies may affect which safe target or which optional access request wins, but they cannot authorize a dig that strands a dwarf.

## Save migration

Move the save schema from version 2 to version 3. Migration must:

1. Add bedrock to the bottom row.
2. Preserve terrain above the bottom row, buildings, storage, dwarves, policies, upgrades, and progression.
3. Initialize an empty access-request collection when absent.
4. Normalize missing movement/task recovery fields to safe defaults.
5. Preserve carried material rather than converting it into stored inventory.

Malformed access data or unsupported save versions use the existing user-facing import error path.

## Acceptance tests

Pure simulation tests must cover:

- bedrock generation and non-mineability,
- completion ignoring bedrock,
- a dwarf refusing to mine the only support below itself,
- safe horizontal mining remaining haulable,
- unsafe targets producing one access request rather than a dig task,
- safer targets winning over unsafe deeper targets,
- stair-step access preparation before a deeper target,
- ladder requests requiring an open, anchored, reachable location,
- access construction receiving priority over optional expansion,
- route loss preserving carried material,
- falling resolving to supported terrain and recalculating work,
- stranded dwarves becoming recovery work rather than continuing to mine,
- save schema 2 to schema 3 migration and round-tripping.

Browser smoke testing should verify that a fresh world visibly has a bottom bedrock layer, dwarves do not disappear through the floor, unsafe mining produces a visible access/construction state, and a completed ladder or stair-step route allows deeper work to resume.

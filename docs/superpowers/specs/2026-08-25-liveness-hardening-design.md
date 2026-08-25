# Liveness Hardening Design

**Goal:** Prevent starter-pocket, stranded-dwarf, hidden-stall, and diagonal-construction deadlocks without weakening support, storage, or material-conservation rules.

## Approved behavior

1. **Bootstrap route:** generated starter terrain includes a guaranteed supported route from the starter pocket into the first mineable frontier. The route is deterministic and does not consume colony resources.
2. **Stranded recovery:** a truly stranded dwarf may use one available common building material from colony stock to create an anchored emergency ladder. The reserved emergency reserve remains protected for cases where no ordinary material is available.
3. **Per-dwarf liveness:** each dwarf tracks no-progress ticks. Recovery/stranded stalls are visible to the safety state even while other dwarves work, and a stalled dwarf cannot be silently masked by colony-wide progress.
4. **Diagonal construction:** construction-site route checks accept safe diagonal builder approaches using the same corner-clearance movement rules as navigation. Building placement and support constraints remain unchanged.

## State and data flow

The optional `DwarfState.noProgressTicks` field is backward-compatible with existing saves. `stepSimulation` updates it from actual movement, mining, hauling, construction, or recovery progress; assignment alone does not reset the counter. Safety evaluation treats a dwarf at the liveness limit with a recovery/stranded task as an active recovery problem.

Starter generation creates the minimum ladder/floor support needed for the first descent and keeps the existing starter material and protected-pocket rules intact. Emergency recovery consumes stock through the existing material-consumption path and only completes a ladder after `findEmergencyLadderPlan` proves a route to storage.

`findAdjacentPaths` will enumerate cardinal and diagonal stands. Its callers continue to require a valid path and `canPlaceBuilding` still enforces anchors, bounds, and empty footprints.

## Verification

- Regression tests reproduce the previously observed fresh-run seeds and assert continued progress after 120 ticks.
- Engine tests cover stranded recovery from stocked common material with no emergency reserve.
- Engine tests cover per-dwarf no-progress escalation while another dwarf is active.
- Pathfinding/logistics tests cover diagonal builder access and retain corner-clearance constraints.
- Full test, typecheck, lint, build, and diff checks must pass.

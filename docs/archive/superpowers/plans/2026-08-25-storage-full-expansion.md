# Storage-full expansion hardening

## Goal

Prevent a full-storage state from becoming permanently inert when capacity expansion is still physically possible, and make the reason for rejected expansion plans visible to players and tests.

## Approved scope

- Replace the self-referential depot limit with a bounded limit that does not shrink as depots fill.
- Permit storage-full recovery to try a depot, a storage upgrade, and then a reachable outpost capacity escape hatch.
- Add finite, material-costed storage upgrades that reserve materials, require a builder, preserve stored inventory, and increase capacity only on completion.
- Expose aggregate capacity, occupancy, reservations, and expansion rejection reasons in derived diagnostics and the inspector.
- Keep non-storage-full blocked states from starting unrelated expansion work.

## Verification

- Regression tests cover a third depot, blocked storage-full planning, upgrade reservation/completion, save parsing, and diagnostics.
- Run the full test suite, lint/type/build checks available in the repository, and replay the imported save through the planner for evidence.

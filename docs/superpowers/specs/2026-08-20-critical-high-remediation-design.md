# Critical/high remediation design

## Goal

Make generated runs startable and preserve simulation/save invariants identified by the in-depth review.

## Design

### Bootstrap reachability

The generator will build the starter pocket as a supported corridor rather than clearing air against independently varying surface heights. The floor beneath every walkable pocket cell will remain solid, and the guaranteed stone vein will be placed immediately beyond the corridor at the same supported elevation. Generation tests will assert that the starter dwarf can reach at least one non-protected mineable target for a representative deterministic seed sweep.

The simulation keeps its current safety policy: foundation cells remain protected during bootstrap. The generator, not the planner, owns the invariant that safe starter work exists.

### Construction material ownership

Builder assignment will derive available units from order reservation minus material already claimed by dwarves carrying that order's material. Assignment will update the order's reserved/claimed accounting atomically in the returned simulation state. Delivery will release exactly one claim and increment delivered exactly once. If an order disappears or becomes invalid, the dwarf will return its carried unit to the global inventory instead of silently dropping it.

The existing serialized shape will be preserved where possible. If a claim field is required for deterministic persistence, it will be optional and normalized during save parsing; otherwise active claims will be derived from dwarf tasks to avoid a new migration.

### Startup persistence

`App` will load the latest valid local save once before starting the interval. The store will retain a safe fallback initial state when storage is absent or invalid. `saveStatus` will become `DIRTY` whenever simulation or player policy state changes after a save, and will remain `SAVED` only for the current serialized state.

### Semantic save validation

The parser will validate nested records against the domain unions in `types.ts`: block/biome values, building types and positive in-bounds footprints, construction states, storage capacity and inventory, dwarf positions/movement/tasks, inventory values, policy values, upgrade values, request/order enums, and references to existing buildings/orders. Invalid payloads will return the existing user-facing error instead of entering the runtime.

## Testing strategy

- Add a failing generated-seed bootstrap test, then fix generation and rerun the bounded sweep.
- Add a failing multi-dwarf one-unit construction test, then fix assignment/return accounting.
- Add parser tests for malformed nested records and a store/browser startup test for local-save restoration.
- Run focused tests after each red/green cycle, followed by the full suite, typecheck, lint, build, deterministic benchmark, and browser smoke.

## Non-goals

This pass does not implement the lower-severity bundle splitting, no-op progression upgrades, planned-footprint overlap policy, or visual polish findings from the review. Those remain separate follow-up work unless a fix exposes a direct dependency.

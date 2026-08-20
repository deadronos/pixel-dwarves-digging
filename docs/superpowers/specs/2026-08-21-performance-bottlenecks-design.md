# Performance Bottlenecks Remediation Design

## Goal

Reduce worst-case simulation and rendering stalls in the Pixel Dwarves digging loop while preserving task-selection semantics, save behavior, and the existing 1×/2×/4× controls.

## Design

The engine will keep the existing pure-state architecture. Dig safety will use a virtual cleared-cell override instead of allocating a full cloned world for every candidate. Candidate selection will sort by the existing score first and stop after the first safe candidate; unsafe-target discovery will reuse the same safety results. A weak world-identity cache will reuse safety results when the relevant storage reservation state is unchanged.

Terrain rendering will retain the existing 18 instanced meshes, but derive positions incrementally from changed cell identities. A mining update changes only the old and new block-position lists, so unchanged block meshes retain their position arrays and do not rebuild. Instanced meshes will compute bounds for normal frustum culling, and the canvas DPR will be capped at 1.5.

The R3F surface will be lazy-loaded so the initial application chunk does not include the renderer. The simulation timer will remain semantically unchanged; no simulation ticks will be dropped or moved to a worker in this pass.

## Testing

- Add pathfinding coverage for virtual dig overrides, including support and return-route behavior.
- Add engine coverage proving candidate ordering remains equivalent and shared safety results do not change task assignment.
- Add pure terrain-position tests proving unchanged block lists retain identity while changed block lists update correctly.
- Add a deterministic stress benchmark for 3/12/24 dwarves and a broad exposed frontier.
- Run the complete test, typecheck, lint, and production build commands.

## Success criteria

- Existing tests remain green.
- The broad-frontier 24-dwarf stress tick is materially below the measured 1.3 seconds.
- Production output code-splits the R3F surface and no longer emits the previous single-chunk warning for the initial entry chunk.
- No behavior changes are introduced to mining, hauling, building, save migration, or progression.

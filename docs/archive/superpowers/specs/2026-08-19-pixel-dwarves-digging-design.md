# Pixel Dwarves Digging Design

## Product goal

Build a side-on 2D pixel excavation simulation in React 19, TypeScript 7, and React Three Fiber. The player directs an autonomous colony through global policies while dwarves physically walk, dig, haul, and gradually clear a seeded finite map. Fully excavating a map or finding an exceptional relic creates a prestige opportunity for permanent upgrades and a new run.

## Design pillars

1. **Autonomous first.** The player chooses policies and watches the colony solve the map rather than placing individual dig orders.
2. **Terrain is the puzzle.** Travel distance, exposed blocks, tunnels, bottlenecks, and stockpile placement create the strategic texture.
3. **Readable pixel simulation.** The map should be understandable at a glance: solid blocks, empty space, biomes, dwarves, and inventory changes must be visually distinct.
4. **Portable simulation state.** Rendering and simulation are separate so the game can later support offline progression without changing its core model.

## Technical approach

Use an R3F orthographic camera for the world viewport, instanced block meshes for efficient rendering, and normal React DOM for the HUD and controls. Keep the simulation in renderer-independent TypeScript modules. Use a deterministic seeded generator and a fixed simulation tick at 10 steps per second; the render loop only samples and presents the latest state.

Target stack:

- React 19
- TypeScript 7
- Vite
- `@react-three/fiber`, `three`, and `@react-three/drei`
- Zustand or an equivalent small external store for React subscriptions
- Vitest for simulation tests
- Playwright or an equivalent browser smoke test for the running app

The exact package versions must be resolved from the current registry during implementation and validated together with lint, typecheck, tests, and build. If the TypeScript 7 toolchain is not compatible with a lint or test dependency, the incompatibility must be recorded explicitly rather than hidden.

## World and terrain

Each run creates a 160 × 80 finite block map from `(seed, runNumber)`. Coordinates use `x` for horizontal distance and `y` for vertical height, with `y = 0` at the deepest layer. The surface is generated from a smooth deterministic height function, with each horizontal segment assigned a biome band.

The first version uses these biome bands:

- **Meadow:** grass surface, dirt, stone, iron, and crystal pockets.
- **Desert:** sand surface, sandstone, stone, coal, and iron.
- **Red-rock:** red stone surface, compact stone, coal, iron, and relic pockets.
- **Frozen:** snow surface, packed soil, ice, stone, and crystal.
- **Mushroom:** mushroom surface, loam, clay, stone, and rare relic pockets.

Core block types are `air`, `grass`, `dirt`, `sand`, `sandstone`, `stone`, `coal`, `iron`, `crystal`, and `relic`. Every solid block has a material, color, dig duration, and inventory value. `air` is not stored in inventory. Generated terrain must guarantee:

- A clear starting pocket at the surface.
- A stockpile near the starting pocket.
- Enough exposed low-tier blocks for the first dwarf task.
- At least one reachable mineral source in a normal run.
- A deterministic layout for the same seed and run number.

## Dwarves and autonomous simulation

The first run begins with three dwarves. Each dwarf stores an id, position, movement state, current task, carried block type, and fatigue-free work state. There is no death, combat, hunger, health, or morale system in the first version.

The simulation planner runs on fixed ticks:

1. Find reachable exposed solid blocks.
2. Score candidates from the colony policy, material priority, distance, and whether mining them exposes new work.
3. Assign the highest-scoring available work to idle dwarves.
4. Move dwarves one grid step at a time along a path.
5. Spend dig ticks beside the target block.
6. Replace the block with `air` and increment its global inventory count.
7. Carry the mined block to the nearest stockpile.
8. Return the dwarf to the planner for a new task.

Dwarves are physically simulated within the visible map. Long hauls and narrow tunnels are intentionally meaningful. The planner can use simple breadth-first reachability and pathfinding for the bounded map; it does not need a general navigation framework.

The player controls colony-wide policies rather than individual orders. The first policy controls are:

- Work preference: `nearest`, `ore-first`, or `deepest-first`.
- Material priority toggles for coal, iron, crystal, and relics.
- Hauling preference: `nearest-stockpile` or `finish-current-route`.

## Prestige and progression

Fully excavating every solid block is the normal prestige condition. Discovering a relic unlocks an optional early-prestige action with a smaller reward and a discovery bonus. A prestige resets the map, dwarves, inventory, and temporary run state while preserving permanent upgrades.

The permanent upgrade tree is intentionally small:

- **Stronger tools:** reduce dig duration.
- **Lightweight gear:** increase movement speed.
- **Bigger satchels:** increase carried load or haul efficiency.
- **Extra bunk:** increase starting dwarf count.
- **Better prospecting:** improve mineral/relic discovery odds or visibility.

Prestige currency and upgrade levels are part of the serialized state. The first version should expose clear costs and effects without requiring a full skill-tree graph editor.

## Persistence and serialization

Use a versioned save object with an explicit schema version, run seed, run number, map blocks, biome assignments, dwarves, inventory, policies, prestige currency, upgrade levels, and simulation clock. Serialize only plain JSON-compatible data.

Implement:

- Automatic local save at a safe interval and after meaningful state changes.
- JSON export to a downloaded file or copied text payload.
- JSON import with schema validation and a clear error message for malformed or unsupported saves.
- New run and reset progress actions with confirmation for destructive resets.

The simulation tick and state representation must not depend on React or Three.js so future offline progression can calculate elapsed ticks from the saved simulation clock.

## UI and visual direction

The app uses a dark charcoal shell, warm parchment text, a restrained brass accent, and muted biome colors. It should feel like a hand-built pixel instrument rather than a dashboard mosaic.

The initial viewport contains:

- A top bar with game name, seed/run label, global inventory strip, dwarf count, prestige currency, and time controls.
- A dominant terrain viewport with crisp nearest-neighbor blocks, no decorative grid, visible dwarf sprites, subtle mining particles, and task markers.
- A compact policy/control bar for pause, 1×/2×/4× speed, work preference, material priority, save/export/import, and new run.
- A bottom or side inspector showing excavation progress, selected biome/material, current discovery, and active policy summary.

Use motion intentionally: dwarves walk between tasks, newly dug blocks produce a brief particle/pop response, inventory counts animate on change, and prestige reveals the next map. Responsive layouts collapse the inspector and make the inventory strip horizontally scrollable on narrow screens.

## Rendering boundaries

R3F renders the terrain and simulation actors. The world renderer reads a snapshot of the simulation state and builds or updates instanced geometry grouped by block material. A separate actor layer renders dwarves and task markers. DOM controls remain outside the canvas so they are accessible and easy to test.

The camera is orthographic and supports pan/zoom within map bounds. The map itself remains pixel-aligned: nearest-neighbor textures, integer grid positions, and stable color palettes should avoid blurry blocks.

## Testing and validation

Pure simulation tests must cover:

- Same seed and run produces the same map.
- Every biome band produces its declared surface/material family.
- The generated start pocket and first work target are reachable.
- Digging changes a solid block to air and increments the correct inventory count.
- Hauling completes only when the dwarf reaches the stockpile.
- Policy scoring changes the selected task as expected.
- Full excavation and relic discovery produce the correct prestige state.
- Save export/import round-trips without losing simulation state.

Project validation must include:

- Unit tests.
- Typecheck.
- Lint.
- Production build.
- Browser smoke test that launches the app, observes terrain and inventory, advances the simulation, exports/imports a save, and exercises a prestige/reset path.

## Open questions intentionally deferred

- Offline progression rules and maximum catch-up duration.
- Whether dwarves can build permanent lifts, bridges, or stockpiles.
- Whether water, cave-ins, heat, or creatures are introduced after the first stable excavation loop.
- Whether maps eventually become larger than 160 × 80 or support multiple layers.
- Whether the prestige currency gets a narrative name and whether relics have unique stories.


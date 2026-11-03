# Game design

Pixel Dwarves is an autonomous, side-on excavation sim. Each run is a finite
160 × 80 slice of solid blocks. The player doesn't place tiles. They set
colony-wide directives and watch dwarves walk, dig, carry and stockpile the
terrain.

The core question is logistical: how does a small colony turn a full block map
into an empty one? Travel distance, bottlenecks, finite storage, supported
routes and biome order all matter.

## World

Runs are generated deterministically from a seed and run number. Five biomes
run left to right across the map, each with its own soil layers:

| Biome | Surface → subsoil → deep |
|---|---|
| Meadow | grass, dirt, stone |
| Desert | sand, sandstone, stone |
| Red-rock | red stone, stone |
| Frozen | snow, packed soil, ice, stone |
| Mushroom | mushroom cap, loam, clay, stone |

Below the subsoil, coal, iron, crystal and relic veins appear in every biome
at the same odds. Relics only appear in the deeper part of the map, and
prospecting upgrades raise the mineral odds.

A permanent one-cell bedrock floor can't be mined and doesn't count toward a
full clear. Every run starts with three dwarves, a surface start pocket, a
level-1 main stockpile, a three-block side stone vein and some starter stone,
so there is always a reachable first task.

## Colony rules

On each fixed simulation tick, a dwarf:

1. finds reachable exposed solid blocks,
2. scores them using the current directives,
3. walks next to the target and digs it out,
4. carries the block to a storage building with free capacity,
5. deposits it and returns to the planner.

**Movement.** Dwarves only walk through supported air. Solid terrain,
stockpile floors, outposts and bridges support horizontal movement; ladders
support vertical movement. A dwarf that loses its support falls to the
nearest supported cell or becomes stranded until access is restored. A
dwarf that loses its route first secures the material it carries, and may
place one anchored emergency ladder from carried or reserved stone.

**Safety.** Before accepting a dig, a dwarf simulates the block becoming air
and checks that it still has support and a route to storage. Unsafe targets
become access requests instead. The colony prefers a safe side tunnel or
stair-step route. If a shaft or gap needs infrastructure, builders reserve
stone and build an anchored ladder or bridge first. Unfunded requests wait
visibly for stone rather than deadlocking. New colonies start in a short
bootstrap phase that protects the ground under the stockpile and start pocket.

**Buildings.** Storage is physical and finite. Any dwarf can become a
builder: builders reserve stone, carry it to a planned site and build bridges,
ladders, depots, outposts or storage upgrades over several trips. Outposts and
depots add local storage and shorten haul routes.

## Player directives

- **Work:** nearest exposed, ore first, or deepest first.
- **Material priority:** coal, iron, crystal, relic.
- **Haul:** main stockpile first, or finish the current route.
- **Build:** essential routes, routes + outposts, or expand logistics.
- **Time:** pause, 1×, 2×, 4×.

## Prestige

A full clear is the normal prestige condition. Finding a relic unlocks an
earlier relic reset with a smaller reward. Prestige wipes the map, dwarves,
inventory and run clock but keeps currency and permanent upgrades:

- **Stronger tools:** shorter dig cycles.
- **Lightweight gear:** faster travel.
- **Bigger satchels:** faster travel while hauling.
- **Extra bunk:** one more starting dwarf.
- **Better prospecting:** better mineral and relic odds.

## Saves

Saves are versioned JSON (schema 5) with autosave to local storage, manual
save, and export/import of `pixel-dwarves-save.json`. Older schemas migrate
forward, and an invalid file shows an error instead of replacing the run.
Terrain is stored as one byte per cell, base64-encoded in the save, so
saves stay small. Simulation state is otherwise plain JSON-compatible data,
so offline catch-up can be added later.

## Open questions

- How many offline ticks should a save catch up, and should there be a cap?
- Should water, cave-ins, heat or creatures add pressure once the core loop is stable?
- Should later maps be larger than 160 × 80, or have multiple layers?
- Should relics have names, stories and one-run mutations?

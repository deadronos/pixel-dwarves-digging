# Pixel Dwarves Digging

## The idea

Pixel Dwarves is an autonomous, side-on excavation simulation. Each run creates a finite 160 × 80 horizontal terrain slice made from solid blocks. The player does not micromanage individual tiles. Instead, they set colony-wide directives and watch dwarves physically walk, dig, carry, and stockpile the terrain into a global inventory.

The central question is logistical: how does a small colony turn a living block map into an empty one? Long travel, bottlenecks, newly exposed materials, and the order of biome bands all matter.

## The first run

Every run is generated deterministically from a seed and run number. The map is divided into readable horizontal biome bands:

- Meadow: grass, dirt, stone, iron, crystal.
- Desert: sand, sandstone, stone, coal, iron.
- Red-rock: red stone, compact stone, coal, iron, relics.
- Frozen: snow, packed soil, ice, stone, crystal.
- Mushroom: mushroom caps, loam, clay, stone, rare relics.

The colony begins with three dwarves, a surface start pocket, and a nearby stockpile. The generator guarantees a reachable first task and mineral material in a normal run.

## Autonomous colony rules

Dwarves operate on a fixed simulation tick. They:

1. Find reachable exposed solid blocks.
2. Score work using the current colony directive.
3. Walk to a tile beside the target.
4. Spend time digging it out.
5. Add the block to the global inventory.
6. Walk the load back to the stockpile.
7. Return to the planner for another task.

The player chooses:

- Work preference: nearest exposed, ore first, or deepest first.
- Material priorities: coal, iron, crystal, and relic.
- Time controls: pause, 1×, 2×, or 4×.

The render loop and simulation loop are separate. The simulation state is plain JSON-compatible data so offline progression can be added later.

## Inventory

The top strip is a global inventory for every mineable block type. Digging increments the matching material count, and the HUD also tracks total blocks stored and remaining solid blocks.

## Prestige

Fully clearing the map is the normal prestige condition. A relic discovery unlocks an optional early relic reset with a smaller reward. Prestige clears the temporary map, dwarves, inventory, and run clock while preserving permanent currency and upgrade levels.

Permanent upgrades:

- Stronger tools: shorter dig cycles.
- Lightweight gear: faster travel.
- Bigger satchels: more efficient hauling.
- Extra bunk: one more starting dwarf.
- Better prospecting: future mineral/relic odds and visibility.

## Saves

The save envelope is versioned JSON. The app autosaves to local storage, supports explicit save, and can export/import a portable pixel-dwarves-save.json. Invalid or unsupported files produce a visible error instead of replacing the current run.

## Current implementation

- React 19 + TypeScript 7 + Vite.
- React Three Fiber orthographic viewport with instanced pixel blocks.
- Deterministic terrain generation and bounded grid pathfinding.
- Autonomous dwarf dig/haul simulation.
- Versioned serialization, local save, export/import, and prestige.
- Dark charcoal, parchment, brass, and muted biome visual system.

## Questions for later versions

- How many offline ticks should a save catch up, and should there be a cap?
- Can dwarves build lifts, bridges, or additional stockpiles?
- Should water, cave-ins, heat, or creatures add pressure after the core loop is stable?
- Should later maps be larger than 160 × 80 or support multiple layers?
- Should relics have unique names, stories, and one-run mutations?

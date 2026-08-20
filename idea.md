# Pixel Dwarves Digging

## The idea

Pixel Dwarves is an autonomous, side-on excavation simulation. Each run creates a finite 160 × 80 horizontal terrain slice made from solid blocks. The player does not micromanage individual tiles. Instead, they set colony-wide directives and watch dwarves physically walk, dig, carry, and stockpile the terrain into a global inventory.

The central question is logistical: how does a small colony turn a living block map into an empty one? Long travel, bottlenecks, newly exposed materials, finite storage, supported routes, and the order of biome bands all matter.

## The first run

Every run is generated deterministically from a seed and run number. The map is divided into readable horizontal biome bands:

- Meadow: grass, dirt, stone, iron, crystal.
- Desert: sand, sandstone, stone, coal, iron.
- Red-rock: red stone, compact stone, coal, iron, relics.
- Frozen: snow, packed soil, ice, stone, crystal.
- Mushroom: mushroom caps, loam, clay, stone, rare relics.

The colony begins with three dwarves, a surface start pocket, and a visible level-one main stockpile. The generator guarantees a reachable first task, supported starter ground, a three-block side stone vein, and starter stockpile stone for the first access route.

## Autonomous colony rules

Dwarves operate on a fixed simulation tick. They:

1. Find reachable exposed solid blocks.
2. Score work using the current colony directive.
3. Walk to a tile beside the target.
4. Spend time digging it out.
5. Carry the block in transit.
6. Walk the load to a storage building with capacity.
7. Deposit the block into that building and return to the planner.

Dwarves only walk through supported air cells. Solid terrain, stockpile floors, outposts, and bridges provide horizontal support. Ladders provide vertical movement. If mining removes a dwarf's support, the dwarf falls to the nearest supported cell or becomes stranded until access is restored.

The world has a permanent one-cell bedrock floor. It cannot be mined and does not count against clear completion. New colonies begin with a short bootstrap phase that protects the foundation beneath the stockpile and starter pocket while establishing a haul loop. Before accepting a dig, a dwarf simulates the target becoming air and checks both support and a route to storage. Unsafe valuable targets create access requests instead of direct dig tasks. The colony first prefers a safe horizontal side tunnel or cardinal stair-step route; if an open shaft or gap needs infrastructure, builders reserve non-emergency stone and construct an anchored ladder or bridge before deeper mining resumes. Unfunded requests wait visibly for stone instead of deadlocking the planner.

The player chooses:

- Work preference: nearest exposed, ore first, or deepest first.
- Material priorities: coal, iron, crystal, and relic.
- Construction policy: conserve essential routes, balance routes and outposts, or expand logistics.
- Time controls: pause, 1×, 2×, or 4×.

The render loop and simulation loop are separate. The simulation state is plain JSON-compatible data so offline progression can be added later.

## Buildings and logistics

The main stockpile is a real, finite-capacity building rather than a hidden coordinate. The top strip aggregates stored and carried material, while the inspector shows main storage capacity, free capacity, construction orders, and outposts.

Any dwarf can become a builder. Builders reserve mined stone, carry it to a planned site, and construct bridges, ladders, or outposts over multiple trips. Expansion policy can request a deterministic remote outpost when the colony has enough stored stone. Outposts provide smaller local storage and shorten future haul routes.

## Prestige

Fully clearing the map is the normal prestige condition. A relic discovery unlocks an optional early relic reset with a smaller reward. Prestige clears the temporary map, dwarves, inventory, and run clock while preserving permanent currency and upgrade levels.

Permanent upgrades:

- Stronger tools: shorter dig cycles.
- Lightweight gear: faster travel.
- Bigger satchels: more efficient hauling.
- Extra bunk: one more starting dwarf.
- Better prospecting: future mineral/relic odds and visibility.

## Saves

The save envelope is versioned JSON schema 4. The app autosaves to local storage, supports explicit save, and can export/import a portable pixel-dwarves-save.json. Version 1 saves migrate their old global inventory into the main stockpile, while version 2 and 3 saves receive bedrock and bootstrap-recovery defaults. Invalid or unsupported files produce a visible error instead of replacing the current run.

## Current implementation

- React 19 + TypeScript 7 + Vite.
- React Three Fiber orthographic viewport with instanced pixel blocks.
- Deterministic terrain generation and bounded grid pathfinding.
- Indestructible bedrock, post-dig safety checks, access-first stair-step excavation, and recoverable haul routes.
- Visible stockpile, per-building storage, grounded movement, falling, bridges, ladders, autonomous construction, and outpost expansion.
- Autonomous dwarf dig/haul/build simulation.
- Versioned serialization, local save, export/import, and prestige.
- Dark charcoal, parchment, brass, and muted biome visual system.

## Questions for later versions

- How many offline ticks should a save catch up, and should there be a cap?
- Should water, cave-ins, heat, or creatures add pressure after the core loop is stable?
- Should later maps be larger than 160 × 80 or support multiple layers?
- Should relics have unique names, stories, and one-run mutations?

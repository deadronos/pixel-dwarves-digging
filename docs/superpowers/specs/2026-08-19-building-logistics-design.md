# Pixel Dwarves Building and Logistics Design

## Summary

Replace the current single-coordinate stockpile model with a building-aware logistics network. The main stockpile becomes a visible, prebuilt, upgradeable building. Dwarves move only through physically supported space, while bridges and ladders provide constructed exceptions. Outposts, finite building storage, and autonomous builder tasks turn access and haul distance into the colony's next strategic layer.

The design preserves the game's autonomous-first direction: the player sets colony-wide construction and hauling policies, while the simulation identifies useful routes, storage expansion, and outpost opportunities.

## Goals

- Make the main stockpile visible and physically meaningful.
- Prevent dwarves from walking through unsupported air.
- Make mined material count as stored only after physical delivery.
- Add autonomous construction as a normal colony task.
- Support bridges, ladders, and remote outposts as a coherent logistics network.
- Keep simulation logic renderer-independent and deterministic.
- Migrate current version 1 saves safely.

## Non-goals for the first implementation

- Combat, injury, hunger, morale, or survival hazards.
- Direct per-dwarf job micromanagement.
- A general crafting tree or a new timber resource.
- Complex structural collapse simulation.
- Offline progression for construction and logistics.

## Domain model

### Buildings

Add a building collection to the world. Each building has an ID, type, footprint, position, level, construction state, and connection metadata. Storage buildings also contain finite per-building inventory and capacity.

Initial building types:

- `stockpile`: the starting level-1 logistics hub; visible, permanent, and upgradeable.
- `outpost`: a smaller constructible storage anchor for remote work.
- `bridge`: a walkable horizontal support across an open gap.
- `ladder`: a vertical connection between supported levels.

The current `world.stockpile` coordinate is replaced by building lookup. A temporary compatibility helper may return the primary stockpile position while consumers migrate.

The stockpile begins prebuilt in the starting pocket. Its first upgrades increase storage capacity and may add loading bays; upgrades do not move the building. Outposts have lower capacity and may be configured as general storage, construction depots, mining outposts, or overflow storage.

### Storage

Inventory is owned by storage buildings and dwarves in transit. The existing global inventory display becomes an aggregate of:

- material stored in the main stockpile,
- material stored in outposts,
- material currently carried by dwarves.

The HUD may continue to display global totals, while the inspector adds per-building and in-transit detail.

Mined material follows this physical sequence:

1. A dwarf mines a block.
2. The block enters the dwarf's carried inventory.
3. The logistics planner selects a storage destination with capacity.
4. The dwarf carries the material to that building.
5. The material is deposited and becomes stored inventory.

If all valid storage is full, the dwarf remains in transit or the haul task pauses until capacity becomes available. The simulation must not silently add material to global storage at the moment of mining.

### Construction orders

A construction order contains:

- an ID and requested building type,
- a footprint and target position,
- required material counts,
- reserved and delivered material counts,
- construction progress,
- connection requirements,
- the reason the order was requested.

Common mined stone is the universal construction material for this slice. Bridges, ladders, outposts, and stockpile expansions consume reserved stone. A later content pass may introduce more specialized materials.

## Movement and support

The terrain cell grid remains the base map. Buildings provide an overlay that changes support and navigation without converting terrain blocks into fake terrain.

- A dwarf occupies an air cell.
- Horizontal walking is allowed only into air cells supported by solid terrain, a completed building, or a completed bridge.
- Vertical movement is allowed only through a connected ladder.
- Bridge tiles act as supported floors and must grow from an anchored end.
- Ladders must attach to supported terrain, a building, or a connected bridge/platform.
- Solid terrain remains non-walkable; dwarves stand in the cell above it.
- Construction sites are not walkable until their support-bearing portions are complete.

The pathfinding graph combines terrain and the building overlay. It must never treat all air cells as walkable. This removes the current floating behavior and prevents routes through open shafts and unsupported overhangs.

If mining removes the support below a dwarf, the dwarf enters a short falling/repositioning state and drops to the nearest supported cell. Falling has no injury cost in this version, but it can interrupt work and change haul distance. If no supported destination exists, the dwarf is marked stranded and the planner creates an access request rather than allowing continued movement through air.

Mining targets must be adjacent to a valid standing cell. The target-selection planner may request construction when valuable work is inaccessible but a valid bridge, ladder, or outpost route can connect it.

## Autonomous construction

Construction is a normal task kind. Any idle dwarf may claim a build task; there are no permanent builder classes initially. A colony-wide policy controls the priority:

- `conserve`: build only essential access routes.
- `balanced`: build useful routes and nearby outposts.
- `expand`: prioritize outposts and logistics capacity.

Builder task sequence:

1. Claim a valid construction order.
2. Travel to a storage building with available reserved materials.
3. Carry the materials to the construction site.
4. Construct over several work ticks.
5. Complete the building and release or consume reservations.
6. Invalidate navigation and logistics caches.

Builders cannot teleport materials or construct at unreachable sites. Bridge orders grow from an anchored end, ladder orders attach to an existing support, and outposts require stable ground and a valid delivery route.

The planner can create construction orders when:

- a valuable work area is inaccessible but has a valid infrastructure route,
- a remote area has enough reachable resources to justify an outpost,
- storage is nearing capacity,
- an outpost or bridge would materially shorten repeated haul routes.

## Logistics and policies

The haul destination planner considers:

- storage capacity,
- path distance,
- current construction reservations,
- material type and building configuration,
- the active hauling policy.

The existing nearest-stockpile and finish-current-route policies remain valid and expand to all storage buildings. Additional policies may include main-stockpile-first, local-outpost-first, and construction-priority. These remain colony-wide directives rather than individual commands.

The logistics network should prefer local outposts for nearby materials when doing so reduces route cost, while preserving a main-stockpile reserve for upgrades and construction. A full building redirects future hauls when another valid destination exists.

## Simulation tick flow

The renderer-independent simulation runs these stages in order:

1. Apply gravity and resolve unsupported dwarves.
2. Rebuild navigation only when terrain or buildings changed.
3. Evaluate storage, access, construction, and outpost needs.
4. Assign idle dwarves to dig, haul, build, or expand.
5. Advance movement and work.
6. Deposit carried materials when dwarves reach storage.
7. Update aggregate inventory, route availability, and construction requests.

Terrain changes and completed buildings invalidate support, navigation, and logistics caches. Movement-only ticks should preserve terrain and building object identities where possible, following the existing performance-oriented architecture.

## Rendering and UI

Add a dedicated building layer between terrain and dwarves. It renders:

- the main stockpile footprint and storage state,
- outposts with capacity/fill indicators,
- completed and under-construction bridges,
- ladders and their connected spans,
- construction markers and material-delivery progress.

Dwarves may show a carried-material indicator and a builder indicator. The inspector should expose the selected building, storage capacity, stored materials, construction progress, and route role. The control bar adds construction and logistics policy controls without adding individual dwarf orders.

## Save migration

Move the save schema from version 1 to version 2. A version 1 save migrates by:

1. Creating a level-1 main stockpile at the saved `world.stockpile` coordinate.
2. Moving the old global inventory into that stockpile.
3. Preserving dwarves, terrain, policies, upgrades, tick, and progression data.
4. Initializing empty outpost, construction, and carried-inventory fields.

Unsupported versions and malformed building data must produce the existing user-facing import error rather than partially loading state.

## Implementation milestones

### Milestone 1: building foundation

Add building types and storage state, render the main stockpile, add finite capacity, aggregate per-building inventory into the HUD, and implement version 1 save migration.

### Milestone 2: physical navigation

Add support-aware pathfinding, grounded movement, gravity/falling, stockpile footprint walkability, and regression tests proving unsupported air is not traversable.

### Milestone 3: autonomous construction

Add construction orders, material reservation and delivery, builder tasks, bridges, ladders, route-triggered access requests, and navigation invalidation.

### Milestone 4: logistics expansion

Add outposts, destination selection across storage buildings, storage policies, overflow behavior, and stockpile/outpost upgrades.

## Acceptance tests

Pure simulation tests must cover:

- stockpile generation and rendering data,
- finite per-building capacity,
- aggregate inventory and physical deposit timing,
- no path through unsupported air,
- grounded routes remaining valid,
- ladder-enabled vertical traversal,
- bridge-enabled gap traversal,
- support removal causing falling/repositioning,
- construction material reservation and consumption,
- autonomous builder assignment,
- outpost placement and reduced haul distance,
- full-storage redirection or pause behavior,
- version 1 save migration and version 2 round-tripping.

Browser smoke testing must verify that the stockpile is visible on a fresh run, dwarves remain grounded, stored inventory changes after hauling rather than mining, construction indicators appear, and a constructed route changes reachable movement.


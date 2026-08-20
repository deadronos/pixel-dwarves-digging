# Bootstrap Safety and Emergency Recovery Design

**Goal:** Prevent fresh colonies from deadlocking when early excavation creates access requests before construction material exists, while giving physically cut-off dwarves a bounded way to restore a route.

## Design

The simulation gets a short bootstrap phase. During bootstrap, dwarves can mine the guaranteed reachable starter stone vein and other shallow side work, but they cannot mine the protected cells immediately beneath the starter pocket or stockpile. The stockpile footprint remains supported as a permanent safety foundation for this phase and for later mining decisions.

World generation guarantees a three-block horizontal stone vein at the edge of the starter pocket. A fresh colony also receives two starter stone blocks in the main stockpile: one is spendable for the first access route and one is reserved for emergency recovery. The reserve is tracked explicitly so ordinary construction cannot consume it.

Access requests remain visible when they cannot yet be funded. They carry a `waiting-for-stone` reason instead of creating construction orders that cannot be delivered. Active access requests are capped and deduplicated so blocked requests do not starve ordinary safe work.

An idle, hauling, or stranded dwarf with no route to storage immediately enters recovery. The dwarf first retries route planning. If a valid adjacent ladder site would restore a storage route, the dwarf may place one emergency ladder using carried stone or the colony's reserved emergency stone. The ladder is created only when its air cell and horizontal anchor are valid. Non-stone carried material is never converted into construction material. If no local rescue is possible, the dwarf stays in recovery and receives no mining task.

The planner orders work as recovery/haul, access construction, access preparation, safe ordinary mining, then optional expansion. It never assigns unsafe mining merely because no other work is available. A colony status helper reports bootstrap, operational, or blocked-with-reason states for the HUD and inspector.

## Data and compatibility

`SimulationState.safety` stores the bootstrap phase and remaining emergency stone. Existing schema 3 saves migrate to schema 4 with bootstrap status derived from progress and one emergency stone reserved when possible. Existing terrain, carried blocks, buildings, and access requests are preserved.

## Acceptance criteria

- Fresh generated worlds expose a reachable stone vein and starter stockpile stone.
- Mining immediately beneath the stockpile/starter pocket is deferred during bootstrap.
- Access requests wait for stone without creating unaffordable construction orders.
- Only a bounded number of open access requests can accumulate.
- A cut-off dwarf stops mining and can build a physically valid emergency ladder when it has carried or reserved stone.
- A cut-off dwarf carrying dirt, sand, or another non-stone block retains that material.
- No material is lost when recovery cannot be completed.
- When no safe work, recovery route, or affordable access construction exists, the colony exposes a blocked status instead of silently continuing unsafe work.
- Schema 3 saves load into schema 4 and round-trip without losing carried material or access state.

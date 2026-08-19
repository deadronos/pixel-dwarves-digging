# Pixel Dwarves Digging

An autonomous 2D side-on pixel excavation simulation built with React 19, TypeScript 7, Vite, and React Three Fiber.

## Run it

    npm install
    npm run dev

Open the local Vite URL. The simulation starts with three dwarves on a deterministic 160 × 80 terrain slice and advances on a fixed 10-tick-per-second simulation loop.

## Controls

- pause / resume and 1×, 2×, 4× control simulation speed.
- work chooses nearest exposed, ore-first, or deepest-first planning.
- Priority toggles tell the planner to favor coal, iron, crystal, or relics.
- save writes the current versioned save to local storage.
- export downloads a portable JSON save.
- import restores a JSON save after schema validation.
- new run creates a new seed while preserving prestige upgrades.
- reset clears all progress after confirmation.
- full clear becomes available when the map has no solid blocks left.
- relic reset becomes available after a relic discovery.

The terrain viewport can be panned and zoomed with the pointer.

## Validate it

    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build

The pure simulation core is tested independently of React or Three.js. It covers deterministic terrain, biome bands, reachability, autonomous dig/haul tasks, policy scoring, prestige, save validation, and the Zustand simulation store.

## Architecture

- src/game/generation.ts creates deterministic biome bands and starter guarantees.
- src/game/pathfinding.ts handles bounded grid paths and exposed work.
- src/game/engine.ts advances dwarves through movement, digging, hauling, and completion.
- src/game/progression.ts handles prestige rewards and permanent upgrades.
- src/game/serialization.ts defines the versioned JSON save envelope.
- src/game/state.ts owns the fixed simulation timer, UI actions, and local persistence.
- src/components/WorldCanvas.tsx renders the world through an orthographic R3F canvas.
- src/components/Hud.tsx, ControlBar.tsx, and Inspector.tsx provide the DOM HUD and controls.

The simulation state is plain JSON-compatible data. Offline progression is intentionally deferred, but the tick counter and serialized run state are ready to support elapsed-time catch-up later.

## Toolchain note

TypeScript 7.0.2 is used as requested. Stable typescript-eslint currently declares a peer range below TypeScript 6.1, so this project uses Biome 2.5.9 for TS/TSX linting while retaining strict TypeScript typechecking.

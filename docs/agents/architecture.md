# Architecture

`src/game/` is the pure simulation, with no React or Three.js imports.
`src/components/` renders it. The Zustand store in `src/game/state.ts`
connects the two.

| Path | Owns |
|---|---|
| `src/game/engine.ts` | Tick orchestrator; `engine/` has targeting, access requests, recovery and per-task advancement |
| `src/game/generation.ts` | Deterministic world generation and cell helpers |
| `src/game/pathfinding.ts` | Grounded paths, ladders, bridges, reachable work |
| `src/game/logistics.ts` | Public logistics API; `logistics/` has storage, access, safety and expansion |
| `src/game/buildings.ts` | Building footprints, support and construction |
| `src/game/progression.ts` | Prestige and permanent upgrades |
| `src/game/serialization.ts` | Versioned save envelope; `serialization/` has migrations and validation |
| `src/game/state.ts` | Zustand store, 100 ms tick timer, local persistence |
| `src/game/selectors.ts` | Cached view models for the HUD and Inspector |
| `src/game/content.ts` | Tunable data: blocks, colours, dig times, building costs |
| `src/components/WorldCanvas.tsx` | R3F canvas, camera and on-demand rendering; `*Layer.tsx` draw terrain, buildings and dwarves |
| `src/components/Hud.tsx`, `Inspector.tsx`, `ControlBar.tsx`, `SettingsModal.tsx` | DOM UI |

Tests sit next to the code as `*.test.ts(x)`, using Vitest with jsdom.
Lint and formatting use Biome (single quotes, no semicolons, trailing commas).

Keep this table current when you add, move or remove a module.

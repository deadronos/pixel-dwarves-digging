# Architecture

`src/game/` is the pure simulation, with no React or Three.js imports.
`src/components/` renders it. The Zustand store in `src/game/state.ts`
connects the two.

## Simulation

- `src/game/engine.ts` — tick orchestrator; `engine/` has targeting, access
  requests, recovery and per-task advancement
- `src/game/blocks.ts` — stable block ids, `getBlock`/`blockAt` accessors, cell
  encode/decode for saves
- `src/game/generation.ts` — deterministic world generation and cell helpers
- `src/game/pathfinding.ts` — grounded paths, ladders, bridges, reachable work
- `src/game/logistics.ts` — public logistics API; `logistics/` has storage,
  access, safety and expansion
- `src/game/buildings.ts` — building footprints, support and construction
- `src/game/progression.ts` — prestige and permanent upgrades
- `src/game/serialization.ts` — versioned save envelope; `serialization/` has
  migrations and validation
- `src/game/state.ts` — Zustand store, 100 ms tick timer, local persistence
- `src/game/selectors.ts` — cached view models for the HUD and Inspector
- `src/game/content.ts` — tunable data: blocks, colours (blocks and buildings),
  dig times, building costs

## Rendering

- `src/components/WorldCanvas.tsx` — R3F canvas, camera and on-demand rendering;
  `*Layer.tsx` draw terrain, mining overlays, buildings and dwarves. The canvas
  is `flat` (no tone mapping), so palette hex values are the literal on-screen
  colours. `palette.test.ts` enforces minimum perceptual distance between every
  block and building colour
- `src/components/dwarfInterpolation.ts` — pure interpolation math for dwarf
  movement between 10 Hz ticks: progress clamping, per-tick walk budget and snap
  threshold (derived from speed and the move-speed/satchel upgrades), "is anyone
  still moving". `DwarfLayer` samples it per frame and drives mesh positions
  through refs, keeping demand rendering awake only while someone is walking
- `src/components/dwarfSprite.ts` — procedural pixel-art dwarf sprites: the
  12 x 17 frame art as character grids, pose/frame/indicator selection, and the
  RGBA sheet builder. No image assets. `dwarfSprite.test.ts` guards the art grid
  and the animation maths
- `src/components/dwarfTexture.ts` — turns a generated dwarf sheet into a
  nearest-filtered `DataTexture` whose window slides along the sheet to show one
  frame. `DwarfLayer` swaps frames through `texture.offset`, so a dwarf is one
  mesh and one draw call
- `src/components/colorMath.ts` — shared sRGB colour helpers (hex parsing,
  darken, mix) used by the sprite and terrain textures
- `src/components/terrainTexture.ts` — fills the single terrain `DataTexture`:
  three texels per cell, depth shading relative to each column's surface, a sky
  gradient above the surface, darkened air inside tunnels, and lit edges on
  every block face that touches air. Refilled only when `world` changes, never
  per frame
- `src/components/terrainShading.ts` — the shading maths behind that texture
  (depth factor, sky and tunnel air, edge lighting) plus the `DEPTH_DARKEN`
  budget `palette.test.ts` checks the shaded extremes against
- `src/components/BuildingLayer.tsx` — finished buildings draw their box;
  planned and under-construction sites draw a scaffold instead —
  `buildingScaffold.ts` holds the pure scaffold art and construction-progress
  maths, `buildingTexture.ts` caches the textures. Progress comes from the
  read-only `constructionOrders` slice passed down from the store
- `src/components/MiningLayer.tsx` — cracks on the block each dwarf is digging;
  `miningFeedback.ts` holds the pure progress/stage maths and `blockArt.ts` +
  `blockTexture.ts` the crack and carried-block art. One cut-out quad per active
  dig, never one per block
- `src/components/Hud.tsx`, `Inspector.tsx`, `ControlBar.tsx`,
  `SettingsModal.tsx` — DOM UI

Tests sit next to the code as `*.test.ts(x)`, using Vitest with jsdom.
Lint and formatting use Biome (single quotes, no semicolons, trailing commas).
Don't add ESLint: typescript-eslint doesn't support TypeScript 7 yet.

Keep this map current when you add, move or remove a module.

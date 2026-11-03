# Pixel Dwarves Digging: in-depth review

Date: 2026-08-20  
Branch: `codex/indepth-review-2026-08-20`  
Scope: code quality, simulation deadlock/livelock risks, visuals, runtime performance, and save/persistence behavior.

## Executive summary

The project builds cleanly and the existing automated suite passes, but the current fresh-run flow is not reliable. The most serious issue is a reproducible bootstrap deadlock caused by terrain support geometry: 47 of 200 deterministic seeds (23.5%) produced zero excavation after 300 simulation ticks. The current browser seed reproduced the same state, with all three dwarves idle and the colony still in `BOOTSTRAP SAFETY` after more than 2,000 ticks.

The second most serious issue is construction assignment accounting. Multiple dwarves can claim the same one-material construction order in one tick even though only one material unit was reserved. The first dwarf completes the order and the other carried units disappear on the next tick. This is especially likely for one-stone access ladders and can silently drain the colony's finite resources.

## Severity scale

- **Critical:** the primary game loop or data integrity fails for a common/reproducible state.
- **High:** a user-visible feature is effectively broken, or state can be lost/corrupted.
- **Medium:** meaningful correctness, scalability, or maintainability risk that does not block every run.
- **Low:** polish, observability, or cleanup issue.

## Findings, ranked

### CRITICAL — fresh runs can permanently deadlock during bootstrap

Evidence:

- `createInitialSimulation('cavern-8459')` starts at `{ x: 12, y: 58 }`; `findReachableExposedSolids` returns only the protected block directly below the dwarf.
- The dwarf remains idle, `totalCleared` remains `0`, and `safety.phase` remains `bootstrap` after 200 ticks.
- Across 200 deterministic seeds, 47 remained at zero cleared blocks after 300 ticks: **23.5%**.
- The live browser reproduced this with `cavern-8459`: all three dwarves remained idle, `0%`, `8,516` blocks remaining, and `BOOTSTRAP SAFETY` after more than 2,000 ticks.

Likely cause: `carveStarterPocket` clears only the rectangle at `start.y..start.y+1`, while the generated surface height varies per column. Neighboring pocket cells can therefore be unsupported and unreachable. The guaranteed side vein is placed at `start.y`, but it is beyond the reachable pocket in affected seeds. `chooseTarget` then filters the only exposed starter block because `isBootstrapProtectedTarget` intentionally protects it.

Relevant code: `src/game/generation.ts:76-98`, `src/game/generation.ts:123-136`, `src/game/pathfinding.ts:66-72`, `src/game/engine.ts:121-149`.

Impact: a new player can receive a non-playing save with no route to the first dig. The existing tests use manually flattened fixtures and do not test generated-seed viability.

Recommended direction: make the starter pocket floor/support invariant explicit—flatten or build a supported corridor to the guaranteed side vein—and add a seeded property test that every fresh run either assigns safe work or enters an explicit recoverable blocked state within a bounded number of ticks.

### HIGH — construction orders can over-assign material and lose resources

Evidence: a generated state with three idle dwarves and one ladder order requiring one reserved stone unit produced three simultaneous builders, all carrying `stone` for the same order. On the next tick the first delivery completed the order; the other two dwarves returned idle and their carried units disappeared.

Relevant code: `src/game/engine.ts:595-664` and `src/game/engine.ts:763-806`.

Likely cause: `chooseBuildOrder` checks `reserved > 0`, but does not subtract material already claimed by active builder tasks. Assignment is sequential inside a tick, so every idle dwarf sees the same reservation before any delivery occurs.

Impact: one-stone access ladders can consume more physical material than their order requires. Repeated losses can create secondary construction/storage deadlocks and make inventory accounting untrustworthy.

Recommended direction: track per-order active material claims, or reserve/debit one unit at assignment time and release it on cancellation. Add a multi-dwarf one-unit construction regression test.

### HIGH — local saves are written but never restored on reload

Evidence: clicking `save` wrote `pixel-dwarves-digging/save-v2` to local storage at `cavern-8459 · tick 2448`. Reloading initialized `cavern-3515 · tick 6` instead, while the old payload remained in local storage.

Relevant code: `src/game/state.ts:106-110`, `src/game/state.ts:173-199`, `src/App.tsx:13-16`.

`loadLocalSave` exists but is never called from the app startup path, and there is no UI action that invokes it. The README describes local save as a supported control.

Impact: a user who uses the visible save button loses the active run on refresh and must manually export/import or access an unused store method.

Recommended direction: load once before starting the simulation interval, make the startup state explicit, and distinguish “saved” from “dirty since save.”

### HIGH — save validation accepts semantically invalid state

Evidence: `parseSave` accepted a schema-4 payload containing a building with `type: "not-real"`, negative width/height/level/capacity, and a dwarf equal to `{}`. It only rejected the payload when the outer array/length checks were violated.

Relevant code: `src/game/serialization.ts:66-101`.

The validator checks container presence and a few scalar fields, but does not validate cell values, building types/footprints/construction states, coordinates, inventory ranges, dwarf task shape, or order references.

Impact: imported or corrupted local data can enter the simulation and cause undefined rendering colors, invalid path/building behavior, or runtime exceptions later rather than returning a clear import error.

Recommended direction: validate nested discriminated unions and numeric bounds before accepting a save; add malformed-building, malformed-dwarf, and invalid-reference tests.

### MEDIUM — current simulation headroom is materially lower in complex states

Measured with `createInitialSimulation` and 24 duplicated dwarves:

- `cavern-1001`: 200 ticks took **1,746 ms** (~8.7 ms/tick).
- The same run at 3/6/12 dwarves took 156/1,185/1,004 ms respectively; variability reflects path/access state, not a stable linear curve.
- A working 24-dwarf state took **13.78 ms** for initial assignment and **81.33 ms** for 20 ticks.

The main cost centers are repeated BFS/path planning in access/storage checks and repeated building/material scans. The world is small enough for the current product scale, but 4× simulation leaves less than the 100 ms tick budget once browser rendering and UI work are included.

Relevant code: `src/game/engine.ts:238-249`, `src/game/engine.ts:272-308`, `src/game/logistics.ts:290-344`, `src/game/pathfinding.ts:34-43`, `src/game/pathfinding.ts:120-199`.

Recommended direction: add a deterministic benchmark to CI, cache storage/path decisions by world revision and origin, replace repeated `MINEABLE_BLOCKS.some` predicates with a set, and profile complex access-request states separately from ordinary mining.

### MEDIUM — production JavaScript bundle is large and the renderer is intentionally uncullable

`npm run build` passes but reports a **1.13 MB minified JavaScript chunk**. The R3F canvas also requests DPR up to 2 and every terrain instanced mesh sets `frustumCulled={false}`. The browser smoke run emitted GPU `ReadPixels` stall warnings during capture; those warnings are not proof of an app bug, but they reinforce the need for a mobile GPU check.

Relevant code: `src/components/WorldCanvas.tsx:40-45`, `src/components/TerrainLayer.tsx:45-50`.

Recommended direction: inspect the production bundle composition, consider lazy-loading the Three/R3F surface, cap DPR on constrained devices, and restore safe frustum bounds or chunk terrain if the world grows.

### MEDIUM — several progression/policy controls are currently no-ops

`satchel` and `prospecting` levels are purchasable but never read by the simulation. `haulingPreference` is stored and displayed but never used for route selection. Only `toolPower`, `moveSpeed`, and `extraBunks` affect behavior.

Evidence: `src/game/engine.ts:748-823` is the only upgrade use in the engine; `rg` found no simulation use of `satchel`, `prospecting`, or `haulingPreference`.

Impact: users can spend prestige currency on upgrades that change no behavior, which undermines the progression loop and makes the directive panel misleading.

Recommended direction: implement the mechanics, or mark unfinished upgrades as unavailable/experimental until they have measurable effects and tests.

### MEDIUM — planned building footprints can overlap

`canPlaceBuilding` excludes `planned` buildings from the overlap check and excludes them from the occupied-cell set. Multiple planned buildings can therefore overlap before construction, after which completion does not revalidate the footprint.

Relevant code: `src/game/buildings.ts:138-161`.

Impact: overlapping visual meshes and ambiguous construction routes are possible when multiple access requests plan nearby structures.

### LOW — visible save status becomes stale after simulation advances

After a successful save, `saveStatus` remains `SAVED` while `tickSimulation` continues changing the serialized state; the tick path never marks the state dirty. Relevant code: `src/game/state.ts:156-162`, `src/game/state.ts:173-176`.

### LOW — run numbering is inconsistent for manual new runs

`newRun` always calls `createInitialSimulation(..., 1, ...)`, so the HUD returns to `RUN 01` even after a player creates subsequent generated runs. Prestige increments the run number correctly. Relevant code: `src/game/state.ts:200-210`.

## Visual review

The desktop composition is cohesive: strong title hierarchy, restrained palette, clear terrain anchor, and readable right-side inspector. The canvas rendering is crisp and the 3D layers maintain a consistent z-order.

Responsive behavior is serviceable but not ideal:

- At 390×844, the title and run label wrap, the inventory strip shows only the first few materials, and the inspector/controls move below the tall terrain viewport. This is functional but makes the operational UI hard to reach on a phone.
- The terrain is intentionally zoomed into a narrow slice on mobile, but there is no visible pan/zoom affordance beyond the cursor behavior. A short hint or a fit-to-world control would reduce discoverability risk.
- The desktop screenshot showed no application error overlay and the browser reported zero page errors. Console warnings were React DevTools, the deprecated `THREE.Clock` warning from the rendering stack, and GPU capture stalls.

Artifacts: `output/playwright/desktop-review.png` and `output/playwright/mobile-review.png`.

## Verification performed

- `npm test -- --run`: **68 tests passed** across 8 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed; 39 files checked.
- `npm run build`: passed; emitted the 1.13 MB chunk warning above.
- Browser smoke: desktop and 390×844 mobile screenshots, live tick inspection, console inspection, save-to-local-storage and reload check.
- Deterministic fresh-run sweep: 200 seeds × 300 ticks; 47 remained at zero cleared blocks.
- Construction accounting probe: reproduced three builders claiming one reserved stone unit.
- Save validation probe: reproduced acceptance of invalid building and dwarf records.

## Overall assessment

The codebase has a solid renderer-independent simulation boundary and good baseline automated coverage, but the tests currently overrepresent hand-authored flat fixtures. Before adding more content, prioritize generated-world viability, finite-material accounting, semantic save validation, and startup persistence. These are the issues most likely to make the simulation appear broken or irrecoverable to players.

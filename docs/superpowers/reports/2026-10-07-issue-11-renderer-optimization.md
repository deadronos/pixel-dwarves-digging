# Issue 11: renderer demand rendering and bundle report

Date: 2026-10-07
Branch: `perf/issue-11-renderer-bundle`
Issue: [#11 Optimize renderer bundle and terrain culling](https://github.com/deadronos/pixel-dwarves-digging/issues/11)

## Context

Issue 11 tracks renderer/runtime cost: a large Three/R3F chunk, GPU `ReadPixels`
stall warnings during capture, and always-on rendering. Earlier work already
lazy-loaded `WorldCanvas`, capped DPR at `[1, 1.5]`, and restored instanced-mesh
frustum culling. This change addresses the remaining scope from the issue's
latest comment: demand rendering, bundle measurement/chunking, and recorded
frame activity.

## Changes

### Demand rendering

`Canvas` now uses `frameloop="demand"`, so the scene only draws when something
asks it to. Invalidation is explicit where R3F cannot infer it:

- `TerrainLayer` mutates `instanceMatrix` through a ref, so it calls
  `invalidate()` after each matrix update. This is the reliable wake-up for
  mined and generated blocks.
- `WorldScene` requests a frame when `world`/`dwarves` change and when the
  dynamic camera is enabled.
- The dynamic-camera `useFrame` keeps invalidating until the damped camera
  settles (new `hasCameraSettled` helper), preventing a frozen mid-flight
  animation.
- Dragging out of auto-follow starts a timer that invalidates when the 2.5 s
  manual-pause window expires, so following resumes without further input.
- Dwarves and buildings render through JSX props, which R3F already invalidates
  via `applyProps`; drei's `OrbitControls` invalidates on change/damping.

No simulation code changed. Pure helpers live in `cameraTracking.ts` and are
unit-tested, since R3F/WebGL cannot render under jsdom.

### Bundle chunking

`vite.config.ts` uses Vite 8's `build.rolldownOptions.output.codeSplitting` to
split `three`/`three-stdlib` and `@react-three/*` into stable vendor chunks.

## Bundle measurements

Production build (`npm run build`), minified / gzip:

| Chunk | Before | After |
| --- | --- | --- |
| `index` (app shell) | 293.97 kB / 89.45 kB | 281.46 kB / 85.35 kB |
| `WorldCanvas` (renderer + three) | 931.53 kB / 247.63 kB | — |
| `three-vendor` | — | 750.98 kB / 190.67 kB |
| `r3f-vendor` | — | 186.30 kB / 59.25 kB |
| `WorldCanvas` (app slice only) | — | 6.66 kB / 2.68 kB |
| `rolldown-runtime` | — | 0.71 kB / 0.42 kB |

Total JavaScript is essentially unchanged (~1.23 MB min / ~338 kB gzip); the
gain is chunk separation for caching, and the renderer-specific app slice
shrinking from 931.53 kB to 6.66 kB. `three-vendor` at 750.98 kB still trips
Vite's 500 kB warning, which reflects Three.js itself rather than app code.

## Frame activity measurements

Measured in Chromium via Playwright against the dev server by counting
`WebGL2RenderingContext.clear()` calls as a render-frame proxy (1× speed):

| Scenario | Render frames |
| --- | --- |
| Active simulation (1×) | ~13.5–16.7 fps (tick-driven; ~900+ draw calls / 1.5 s) |
| Paused and fully settled | **0 clears / 0 draws over 2 s** |
| Pan + wheel while paused | 4 clears / 144 draws (interaction renders) |
| Manual pause window → resume timer | 2 clears during window, 1 clear after (loop wakes and re-settles) |

Before this change the canvas rendered continuously at display refresh rate
(~60 fps / ~120 clears per 2 s) regardless of activity. Paused/idle now draws
nothing until an update, interaction, or camera animation invalidates.

## Verification

- `npm run lint`, `npm run typecheck`, `npm test -- --run` (230 tests),
  `npm run build`: all pass.
- Browser smoke test: 0 console errors; simulation tick advances at 1×;
  pan/zoom, dynamic-camera follow, and manual-pause resume all render; terrain,
  biome bands, dwarves, and panels render correctly.

## Follow-ups

- `three-vendor` still exceeds Vite's 500 kB warning. Materially shrinking it
  would require dropping `@react-three/drei` or a deeper Three import diet
  (deferred as the higher-risk option on issue 11).
- The `THREE.Clock` deprecation warning originates in the current R3F/Three
  stack; track it during dependency updates.
- Consider a constrained/mobile-device frame measurement and an automated
  frame-activity guard.

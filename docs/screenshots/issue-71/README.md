# Issue #71 screenshots

Before/after captures for the visual-polish work, all at a 1440x900 viewport
and device scale factor 1.

| File | What it shows |
|---|---|
| `before-*.png` | `main` at `c85dd42`, before any of this work |
| `after-part1-*.png` | dwarf sprites (commit 1) |
| `after-part2-*.png` | dig cracks and the carried block chip (commit 2) |
| `after-part3-*.png` | terrain depth cues (commit 3) |
| `after-part4-*.png` | building scaffolds (commit 4) |

Each set has:

- `-zoom.png`: the follow camera settled on the mining front (about 22 px per
  cell), so dwarf sprites, cracks and chips can be read.
- `-overview.png`: the same tick with the follow camera pinned off and zoomed
  out to roughly the canvas' default zoom, so the whole scene is visible.
- `-construction.png`: the first tick with a planned building, follow camera.
- `-construction-progress.png`: a site with material delivered. The planner
  currently finishes a site in one delivery, so the harness injects a
  half-delivered construction order into the deterministic save and reloads.

## How the comparison stays fair

The page is loaded with `Math.random` replaced by a fixed PRNG (so the starter
seed is the same every run) and `localStorage` cleared. The 100 ms simulation
interval is captured instead of scheduled, and the harness drives an exact
number of ticks 100 ms apart:

- the action shots are taken at the first tick (>= 150) where one dwarf is
  digging and another is hauling a block: tick 314 of seed `cavern-7077`;
- the construction shots at the first tick with a non-completed building:
  tick 942 of the same run.

Both cameras are then pinned through the settings dialog before zooming, so
the framing does not drift between runs.

The harness itself (Playwright, driving a `npx vite --port 5197` server) is a
throwaway script and is not part of the repository.

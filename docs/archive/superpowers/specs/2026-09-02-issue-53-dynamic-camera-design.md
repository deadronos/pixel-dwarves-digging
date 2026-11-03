# Calm Dynamic Camera Design

## Goal

Add a default-on camera mode that smoothly follows the area where dwarf activity is concentrated, while preserving deliberate manual pan/zoom and avoiding hectic motion or cropped-out work.

## Visual thesis

The viewport should feel like a calm cartographer's lens: the camera settles into the active work area with quiet momentum, then opens its view decisively when the colony spreads out.

## Interaction thesis

- Frame-level damping keeps center movement and zoom continuous rather than ticking with simulation updates.
- Zoom-out uses a faster easing rate than zoom-in, revealing newly spread activity before it can leave the viewport.
- Manual OrbitControls input creates a temporary pause state; a compact status cue distinguishes that pause from the user's on/off toggle.

## Architecture

Keep camera behavior outside `SimulationState` and serialized saves. Add a small pure module, `src/components/cameraTracking.ts`, that receives world dimensions, dwarf positions, and activity metadata and returns a padded focus box plus a bounded target center/zoom. It also exposes a damping helper so unit tests can verify that zoom-out converges faster than zoom-in. `WorldCanvas` owns the R3F `useFrame` adapter, OrbitControls event handling, and a short manual-input resume timer. The UI/session toggle lives in the Zustand store alongside `paused` and `speed`, defaults to `true`, and is passed to both `ControlBar` and `WorldCanvas`.

The tracking model uses each dwarf's current task and movement state to weight the focus set. Idle dwarves remain valid anchors, but active movement/task positions receive higher weight so a single distant idle dwarf does not pull the camera away from the colony's work. The model computes the weighted activity bounds, adds padding, clamps them to map bounds, and derives an orthographic zoom that fits the box within the canvas aspect ratio. If no active task exists, it falls back to all dwarf positions and then the map center.

When dynamic mode is enabled and not temporarily paused, `useFrame` lerps the camera toward the model target. Manual `start`/`change` events mark the temporary pause and arm a roughly 2.5-second inactivity timeout; the timeout only resumes follow if the toggle is still enabled. Disabling the toggle immediately stops frame updates without disturbing the user's current camera pose. Re-enabling it eases back toward the current activity box.

## UI and accessibility

Add a labeled checkbox/toggle in the time/camera controls: `DYNAMIC CAMERA`, checked by default. When manual input has paused follow, expose a short `manual pause` status adjacent to the toggle without changing the checked state. The control is keyboard accessible, uses a native input, and has an accessible name that states the action. This is session UI state only and must not alter exported or imported simulation data.

## Testing

- Pure camera tests cover weighted activity bounds, map/aspect clamping, fallback focus, zoom limits, and faster zoom-out damping.
- Store tests cover the default-on toggle and state updates without changing the simulation object or save payload.
- Component tests cover the labeled toggle and its temporary-pause status where the existing test harness can mount the control surface.
- Run the existing full test, typecheck, lint, build, and diff checks. Perform a browser smoke of the canvas to confirm no console errors and manually exercise toggle, pan/zoom pause, auto-resume, and a spread-out dwarf cluster.

## Non-goals

- No changes to simulation movement, dwarf task assignment, world generation, or save schema.
- No forced camera recenter when the player has disabled dynamic mode.

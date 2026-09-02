# Calm Dynamic Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-on, smoothly damped camera that follows active dwarf work, pauses after manual camera input, and exposes a separate user toggle.

**Architecture:** Keep camera math in a pure `cameraTracking.ts` module with no R3F or Zustand imports. It computes weighted activity bounds, padded/clamped orthographic targets, and asymmetric damping rates. `WorldCanvas` adapts that model through `useFrame` and OrbitControls events, while the Zustand store owns only the session-level enabled toggle; temporary manual pause remains local UI state and never enters saves.

**Tech Stack:** TypeScript, React, Zustand, React Three Fiber, `@react-three/drei` OrbitControls, Vitest.

---

### Task 1: Build the pure camera tracking model

**Files:**
- Create: `src/components/cameraTracking.ts`
- Test: `src/components/cameraTracking.test.ts`

- [ ] **Step 1: Write failing model tests**

Cover one behavior per test: active dwarves outweigh idle anchors; bounds receive padding and stay inside the map; the target zoom respects min/max limits and canvas aspect; empty dwarf input falls back to map center; and `dampCameraValue` moves farther for the zoom-out rate than the zoom-in rate over the same frame delta.

Use plain objects matching `Position`, `World`, and a minimal `{ position, task, movement }` dwarf shape. The public API should be:

```ts
export type CameraTarget = { center: Position; zoom: number }
export function getCameraTarget(
  world: Pick<World, 'width' | 'height'>,
  dwarves: ReadonlyArray<Pick<DwarfState, 'position' | 'task' | 'movement'>>,
  aspect: number,
): CameraTarget
export function dampCameraValue(
  current: number,
  target: number,
  deltaSeconds: number,
  rate: number,
): number
```

- [ ] **Step 2: Run the focused tests and verify the expected missing-module failure**

Run:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue53-camera-red.localstorage' npm test -- --run src/components/cameraTracking.test.ts --maxWorkers=1
```

Expected: FAIL because `cameraTracking.ts` does not yet exist.

- [ ] **Step 3: Implement the minimal pure model**

Assign higher weight to dwarves with `task.kind !== 'idle'` or `movement !== 'grounded'`, compute weighted min/max extents, include all dwarf positions as low-weight anchors, add fixed padding, clamp to `[0, width] × [0, height]`, and derive zoom from the padded width/height and aspect. Clamp zoom to `5..22`; use the map center when no positions exist. Implement exponential damping as `current + (target - current) * (1 - exp(-rate * deltaSeconds))`; callers will supply a faster zoom-out rate than zoom-in.

- [ ] **Step 4: Run the focused model tests**

Run the command from Step 2. Expected: all model tests pass.

- [ ] **Step 5: Commit the pure model**

```bash
git add src/components/cameraTracking.ts src/components/cameraTracking.test.ts
git commit -m "feat: add testable dynamic camera tracking"
```

### Task 2: Add the session-level dynamic-camera toggle

**Files:**
- Modify: `src/game/state.ts`
- Test: `src/game/state.test.ts`

- [ ] **Step 1: Write failing store tests**

Add tests asserting a new store starts with `dynamicCameraEnabled === true`, that `setDynamicCameraEnabled(false)` updates only the UI state, and that the simulation object and exported save payload do not gain camera fields.

- [ ] **Step 2: Run the focused store tests**

Run:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue53-store.localstorage' npm test -- --run src/game/state.test.ts -t "dynamic camera" --maxWorkers=1
```

Expected: FAIL because the field and setter are not defined.

- [ ] **Step 3: Implement the toggle state**

Add `dynamicCameraEnabled: boolean` and `setDynamicCameraEnabled(enabled: boolean)` to `GameStore`; initialize the field to `true` beside `paused` and `speed`; implement the setter with `set({ dynamicCameraEnabled: enabled })`. Do not include the field in `SimulationState`, serialization, import/export, or save-status updates.

- [ ] **Step 4: Run the focused store tests**

Run the command from Step 2. Expected: all dynamic-camera store tests pass.

- [ ] **Step 5: Commit the store toggle**

```bash
git add src/game/state.ts src/game/state.test.ts
git commit -m "feat: add default-on dynamic camera toggle"
```

### Task 3: Integrate smooth follow and manual pause into the canvas

**Files:**
- Modify: `src/components/WorldCanvas.tsx`
- Create: `src/components/WorldCanvas.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Add a component-level test harness around the pure controller seams that verifies a disabled toggle does not request camera updates, a manual start/change event reports temporary pause, and the pause callback returns to false after the configured 2.5-second idle window. Keep OrbitControls and Canvas mocked only at this adapter boundary; the pure model remains covered by Task 1.

- [ ] **Step 2: Run the focused canvas tests and verify the missing-prop/controller failure**

Run:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue53-canvas.localstorage' npm test -- --run src/components/WorldCanvas.test.tsx --maxWorkers=1
```

Expected: FAIL because the dynamic-camera props/controller behavior does not exist.

- [ ] **Step 3: Implement the R3F adapter**

Extend `WorldCanvasProps` with `dynamicCameraEnabled` and `onTemporaryPauseChange`. In `WorldScene`, use `useThree` and `useFrame`; keep refs for the current pause deadline and last target. On OrbitControls `onStart`/`onChange`, set the deadline to `performance.now() + 2500` and report `true`; in `useFrame`, report `false` once the deadline expires. When enabled and not paused, call `getCameraTarget(world, dwarves, size.width / size.height)`, damp `camera.position.x/y`, and damp zoom with rate `2.2` for center/zoom-in and `5.5` when the target zoom is lower (zooming out). Call `camera.updateProjectionMatrix()` after zoom changes. Keep `enableRotate={false}`, pan, cursor zoom, and the existing `5..22` OrbitControls limits.

- [ ] **Step 4: Run the focused canvas tests**

Run the command from Step 2. Expected: all adapter tests pass.

- [ ] **Step 5: Commit the canvas integration**

```bash
git add src/components/WorldCanvas.tsx src/components/WorldCanvas.test.tsx
git commit -m "feat: smoothly follow active dwarf work"
```

### Task 4: Wire the control and validate the user flow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ControlBar.tsx`
- Modify: `src/styles.css`
- Test: `src/components/panels.test.tsx`

- [ ] **Step 1: Write failing control tests**

Mount the control surface and assert a keyboard-accessible checkbox labeled `DYNAMIC CAMERA` is checked by default, toggling it calls the store setter, and a `manual pause` status appears only when the App-provided temporary-pause prop is true without changing the checkbox state.

- [ ] **Step 2: Run the focused control tests**

Run:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue53-controls.localstorage' npm test -- --run src/components/panels.test.tsx -t "dynamic camera" --maxWorkers=1
```

Expected: FAIL because the control and App wiring are not present.

- [ ] **Step 3: Implement App/control wiring and restrained styling**

Keep `dynamicCameraPaused` as App-local state. Read `dynamicCameraEnabled` and `setDynamicCameraEnabled` from the store in `ControlBar`; render a native checkbox with the accessible label `DYNAMIC CAMERA`, plus `manual pause` text when the prop is true. Pass the toggle and pause callback through `App` to `WorldCanvas`; pass the pause state to `ControlBar`. Add only the spacing/status styles needed to fit the existing control bar and preserve its monochrome pixel palette.

- [ ] **Step 4: Run focused controls and full validation**

Run the focused command from Step 2, then:

```bash
NODE_OPTIONS='--localstorage-file=/tmp/pixel-dwarves-issue53-final.localstorage' npm test -- --run --maxWorkers=1
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all tests pass; typecheck, lint, build, and whitespace checks pass; the build retains only the existing large-canvas chunk warning.

- [ ] **Step 5: Browser smoke and commit**

Start the dev server, mount the real app in a browser, and verify: default-on follow; toggle off leaves the manual camera pose untouched; pan/zoom shows `manual pause`; follow resumes after about 2.5 seconds; a spread-out active cluster zooms out promptly and a compact cluster eases back in. Confirm zero new console errors. Then commit:

```bash
git add src/App.tsx src/components/ControlBar.tsx src/styles.css src/components/panels.test.tsx
git commit -m "feat: expose dynamic camera controls"
git status --short --branch
```

Open a draft PR linked to issue 53 with the focused/full validation commands and browser-smoke notes.

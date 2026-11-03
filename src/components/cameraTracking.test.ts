import { describe, expect, it } from 'vitest'
import {
  clampCameraCenter,
  createCameraPauseController,
  dampCameraValue,
  getCameraTarget,
  syncCameraControlTarget,
} from './cameraTracking'

const world = { width: 100, height: 40 }
const viewport = { width: 300, height: 150 }

const dwarf = (position: { x: number; y: number }, active = false) => ({
  position,
  movement: active ? ('falling' as const) : ('grounded' as const),
  task: {
    kind: active ? ('dig' as const) : ('idle' as const),
    path: [],
    progress: 0,
  },
})

describe('camera tracking', () => {
  it('keeps the controls target aligned with the camera center without changing depth', () => {
    const controlsTarget = { x: 0, y: 0, z: 0 }

    syncCameraControlTarget(controlsTarget, { x: 18, y: -7 })

    expect(controlsTarget).toEqual({ x: 18, y: -7, z: 0 })
  })

  it('weights active dwarf work more strongly than idle anchors', () => {
    const target = getCameraTarget(
      world,
      [dwarf({ x: 10, y: 10 }), dwarf({ x: 80, y: 20 }, true)],
      viewport,
    )

    expect(target.center.x).toBeGreaterThan(50)
  })

  it('pads and clamps the focus target to map bounds', () => {
    const target = getCameraTarget(
      world,
      [dwarf({ x: 0, y: 0 }, true)],
      viewport,
    )

    expect(target.center.x).toBeGreaterThanOrEqual(0)
    expect(target.center.x).toBeLessThanOrEqual(world.width)
    expect(target.center.y).toBeGreaterThanOrEqual(0)
    expect(target.center.y).toBeLessThanOrEqual(world.height)
    expect(target.zoom).toBeGreaterThanOrEqual(5)
    expect(target.zoom).toBeLessThanOrEqual(22)
  })

  it('falls back to map center when no dwarves are available', () => {
    expect(getCameraTarget(world, [], viewport)).toEqual({
      center: { x: 50, y: 20 },
      zoom: 5,
    })
  })

  it('derives zoom from the canvas size in pixels (#64)', () => {
    const dwarves = [dwarf({ x: 50, y: 20 }, true)]

    // Padded focus is 12 × 12 cells; the 150 px height is the tighter fit.
    expect(getCameraTarget(world, dwarves, viewport).zoom).toBeCloseTo(12.5)
    // A taller canvas zooms in further, up to the maximum.
    expect(
      getCameraTarget(world, dwarves, { width: 600, height: 240 }).zoom,
    ).toBeCloseTo(20)
    expect(
      getCameraTarget(world, dwarves, { width: 1200, height: 800 }).zoom,
    ).toBe(22)
  })

  it('zooms out to fit dwarves spread along the wider axis (#64)', () => {
    const spread = [
      dwarf({ x: 10, y: 20 }, true),
      dwarf({ x: 58, y: 20 }, true),
    ]

    // Padded width is 60 cells across a 600 px canvas.
    expect(
      getCameraTarget(world, spread, { width: 600, height: 300 }).zoom,
    ).toBeCloseTo(10)
  })

  it('keeps the visible area inside the world (#65)', () => {
    // Zoom 10 on a 200 × 100 px canvas shows 20 × 10 cells.
    const view = { width: 200, height: 100 }
    expect(clampCameraCenter({ x: 2, y: 1 }, 10, view, world)).toEqual({
      x: 10,
      y: 5,
    })
    expect(clampCameraCenter({ x: 99, y: 39 }, 10, view, world)).toEqual({
      x: 90,
      y: 35,
    })
    expect(clampCameraCenter({ x: 40, y: 20 }, 10, view, world)).toEqual({
      x: 40,
      y: 20,
    })
  })

  it('centres an axis when the world is smaller than the view (#65)', () => {
    expect(
      clampCameraCenter({ x: 3, y: 30 }, 1, { width: 200, height: 100 }, world),
    ).toEqual({ x: 50, y: 20 })
  })

  it('returns a follow target whose view stays inside the world (#65)', () => {
    const target = getCameraTarget(
      world,
      [dwarf({ x: 0, y: 0 }, true)],
      viewport,
    )

    // Zoom 12.5 on 300 × 150 px shows 24 × 12 cells.
    expect(target.center.x).toBeCloseTo(12)
    expect(target.center.y).toBeCloseTo(6)
  })

  it('moves farther toward a zoom-out target at the faster rate', () => {
    const slow = dampCameraValue(10, 5, 1 / 60, 2.2)
    const fast = dampCameraValue(10, 5, 1 / 60, 5.5)

    expect(10 - fast).toBeGreaterThan(10 - slow)
  })

  it('keeps dynamic tracking paused for the entire manual drag', () => {
    const pause = createCameraPauseController()

    pause.onDragStart(1_000)

    expect(pause.isPaused(4_000)).toBe(true)

    pause.onDragEnd(4_000)

    expect(pause.isPaused(6_499)).toBe(true)
    expect(pause.isPaused(6_500)).toBe(false)
  })
})

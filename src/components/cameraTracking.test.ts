import { describe, expect, it } from 'vitest'
import {
  clampCameraCenter,
  createCameraPauseController,
  createFollowCamera,
  dampCameraValue,
  getCameraTarget,
  getMapFitZoom,
  syncCameraControlTarget,
} from './cameraTracking'

const world = { width: 100, height: 40, buildings: [] }
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

  it('frames active work without pulling idle dwarves into view', () => {
    const target = getCameraTarget(
      world,
      [dwarf({ x: 10, y: 10 }), dwarf({ x: 80, y: 20 }, true)],
      viewport,
    )

    expect(target.center.x).toBe(80.5)
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
      zoom: 3,
    })
  })

  it('derives zoom from the canvas size in pixels (#64)', () => {
    const dwarves = [dwarf({ x: 50, y: 20 }, true)]

    // Padded focus is 12 × 12 cells; the 150 px height is the tighter fit.
    expect(getCameraTarget(world, dwarves, viewport).zoom).toBeCloseTo(12.5)
    // A taller canvas zooms in further, up to the maximum.
    expect(
      getCameraTarget(world, dwarves, { width: 600, height: 240 }).zoom,
    ).toBe(18)
    expect(
      getCameraTarget(world, dwarves, { width: 1200, height: 800 }).zoom,
    ).toBe(18)
  })

  it('frames a local area instead of zooming out for a distant crew', () => {
    const spread = [
      dwarf({ x: 10, y: 20 }, true),
      dwarf({ x: 58, y: 20 }, true),
    ]

    const target = getCameraTarget(world, spread, { width: 600, height: 300 })
    expect(target.zoom).toBe(18)
    expect(target.center.x).toBeCloseTo(600 / 36)
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

    expect(pause.isPaused(9_999)).toBe(true)
    expect(pause.isPaused(10_000)).toBe(false)
  })
})

it('fits the whole map using the tighter canvas axis', () => {
  expect(getMapFitZoom(world, { width: 800, height: 150 })).toBe(3.75)
  expect(getMapFitZoom(world, { width: 200, height: 500 })).toBe(2)
})

it('keeps the current crew through ties and short changes in activity', () => {
  const camera = createFollowCamera()
  const left = dwarf({ x: 20, y: 20 }, true)
  const right = dwarf({ x: 80, y: 20 }, true)
  const helper = dwarf({ x: 81, y: 20 }, true)
  expect(camera.update(world, [left, right], viewport, 0).center.x).toBe(20.5)
  expect(camera.update(world, [right, left], viewport, 1_000).center.x).toBe(
    20.5,
  )
  expect(
    camera.update(world, [right, helper, left], viewport, 1_100).center.x,
  ).toBe(20.5)
  expect(
    camera.update(world, [right, helper, left], viewport, 3_099).center.x,
  ).toBe(20.5)
  expect(
    camera.update(world, [right, helper, left], viewport, 3_100).center.x,
  ).toBe(81)
})

it('holds the focus steady as a nearby worker shifts one tile', () => {
  const camera = createFollowCamera()
  const start = camera.update(
    world,
    [dwarf({ x: 30, y: 20 }, true)],
    viewport,
    0,
  )
  expect(
    camera.update(world, [dwarf({ x: 31, y: 20 }, true)], viewport, 100),
  ).toEqual(start)
})

it('clears the manual pause immediately when recentering', () => {
  const pause = createCameraPauseController()
  pause.onDragStart(0)
  pause.onDragEnd(100)
  pause.resume()
  expect(pause.isPaused(200)).toBe(false)
})

it('holds a small zoom change until the work needs room at the edge', () => {
  const camera = createFollowCamera()
  const view = { width: 300, height: 216 }
  const lead = dwarf({ x: 30, y: 20 }, true)
  expect(camera.update(world, [lead], view, 0).zoom).toBe(18)
  const nearby = dwarf({ x: 31, y: 20 }, true)
  expect(camera.update(world, [lead, nearby], view, 100).zoom).toBe(18)
  const nearEdge = dwarf({ x: 37, y: 20 }, true)
  expect(camera.update(world, [lead, nearEdge], view, 200).zoom).toBeCloseTo(
    300 / 19,
  )
})

it('waits before leaving a crew that briefly switches from digging to hauling', () => {
  const camera = createFollowCamera()
  const left = dwarf({ x: 20, y: 20 }, true)
  const right = dwarf({ x: 80, y: 20 }, true)
  const home = camera.update(world, [left, right], viewport, 0)
  const hauling = { ...left, task: { ...left.task, kind: 'haul' as const } }
  expect(camera.update(world, [hauling, right], viewport, 100)).toEqual(home)
  expect(camera.update(world, [left, right], viewport, 200)).toEqual(home)
  camera.update(world, [hauling, right], viewport, 300)
  expect(camera.update(world, [hauling, right], viewport, 2_300).center.x).toBe(
    80.5,
  )
})

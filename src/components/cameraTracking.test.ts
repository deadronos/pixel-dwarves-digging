import { describe, expect, it } from 'vitest'
import { dampCameraValue, getCameraTarget } from './cameraTracking'

const world = { width: 100, height: 40 }

const dwarf = (position: { x: number; y: number }, active = false) => ({
  position,
  movement: active ? ('falling' as const) : ('grounded' as const),
  task: { kind: active ? ('dig' as const) : ('idle' as const), path: [], progress: 0 },
})

describe('camera tracking', () => {
  it('weights active dwarf work more strongly than idle anchors', () => {
    const target = getCameraTarget(
      world,
      [dwarf({ x: 10, y: 10 }), dwarf({ x: 80, y: 20 }, true)],
      1,
    )

    expect(target.center.x).toBeGreaterThan(50)
  })

  it('pads and clamps the focus target to map bounds', () => {
    const target = getCameraTarget(world, [dwarf({ x: 0, y: 0 }, true)], 1)

    expect(target.center.x).toBeGreaterThanOrEqual(0)
    expect(target.center.x).toBeLessThanOrEqual(world.width)
    expect(target.center.y).toBeGreaterThanOrEqual(0)
    expect(target.center.y).toBeLessThanOrEqual(world.height)
    expect(target.zoom).toBeGreaterThanOrEqual(5)
    expect(target.zoom).toBeLessThanOrEqual(22)
  })

  it('falls back to map center when no dwarves are available', () => {
    expect(getCameraTarget(world, [], 1)).toEqual({
      center: { x: 50, y: 20 },
      zoom: 5,
    })
  })

  it('moves farther toward a zoom-out target at the faster rate', () => {
    const slow = dampCameraValue(10, 5, 1 / 60, 2.2)
    const fast = dampCameraValue(10, 5, 1 / 60, 5.5)

    expect(10 - fast).toBeGreaterThan(10 - slow)
  })
})

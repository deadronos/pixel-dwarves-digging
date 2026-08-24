import { describe, expect, it } from 'vitest'
import { findPath } from './pathfinding'
import type { Cell, World } from './types'

function makeStressWorld(): World {
  const width = 160
  const height = 80
  const cells: Cell[] = Array.from({ length: width * height }, (_, index) => {
    const y = Math.floor(index / width)
    return {
      block: (y === 0 ? 'stone' : 'air') as Cell['block'],
      biome: 'meadow',
    }
  })

  return {
    width,
    height,
    cells,
    seed: 'pathfinding-performance',
    runNumber: 1,
    surfaceHeights: Array(width).fill(0),
    biomes: Array(width).fill('meadow'),
    start: { x: 1, y: 1 },
    stockpile: { x: 1, y: 1 },
    buildings: [],
  }
}

describe('pathfinding performance', () => {
  it('benchmarks repeated multi-dwarf route queries deterministically', () => {
    const world = makeStressWorld()
    const origins = Array.from({ length: 24 }, (_, index) => ({
      x: index + 1,
      y: 1,
    }))
    const destinations = Array.from({ length: 32 }, (_, index) => ({
      x: 96 + index * 2,
      y: 1,
    }))
    const started = performance.now()
    let routeCount = 0

    for (let round = 0; round < 20; round += 1) {
      for (const origin of origins) {
        for (const destination of destinations) {
          const path = findPath(world, origin, destination)
          expect(path?.at(-1)).toEqual(destination)
          routeCount += 1
        }
      }
    }

    const elapsed = performance.now() - started
    console.info(
      JSON.stringify({
        benchmark: 'pathfinding-repeated-origin-routes',
        routes: routeCount,
        elapsedMs: Number(elapsed.toFixed(2)),
      }),
    )
    expect(routeCount).toBe(24 * 32 * 20)
  })
})

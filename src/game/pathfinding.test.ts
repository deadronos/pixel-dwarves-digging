import { describe, expect, it } from 'vitest'
import { findPath, findReachableExposedSolids } from './pathfinding'
import type { Cell, World } from './types'

function makeWorld(rows: string[]): World {
  const height = rows.length
  const width = rows[0].length
  const cells: Cell[] = rows.flatMap((row) =>
    [...row].map((value) => ({
      block:
        value === '.'
          ? 'air'
          : value === 'b'
            ? 'bedrock'
            : value === 'stone'
              ? 'stone'
              : 'dirt',
      biome: 'meadow',
    })),
  )

  return {
    width,
    height,
    cells,
    seed: 'test',
    runNumber: 1,
    surfaceHeights: Array(width).fill(2),
    biomes: Array(width).fill('meadow'),
    start: { x: 1, y: 1 },
    stockpile: { x: 1, y: 1 },
    buildings: [],
  }
}

describe('findPath', () => {
  it('finds a shortest path across a grounded floor', () => {
    const world = makeWorld(['######', '......', '######'])

    expect(findPath(world, { x: 0, y: 1 }, { x: 5, y: 1 })).toEqual(
      Array.from({ length: 5 }, (_, index) => ({ x: index + 1, y: 1 })),
    )
  })

  it('does not route through unsupported open air', () => {
    const world = makeWorld(['##.###', '......', '######'])

    expect(findPath(world, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeNull()
  })

  it('uses a completed bridge across an unsupported gap', () => {
    const world = makeWorld(['##.###', '......', '######'])
    world.buildings = [
      {
        id: 'bridge-1',
        type: 'bridge',
        position: { x: 2, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]

    expect(findPath(world, { x: 1, y: 1 }, { x: 3, y: 1 })).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ])
  })

  it('uses a connected ladder for vertical travel', () => {
    const world = makeWorld(['#####', '.....', '.....'])
    world.buildings = [
      {
        id: 'ladder-1',
        type: 'ladder',
        position: { x: 2, y: 2 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]

    expect(findPath(world, { x: 2, y: 1 }, { x: 2, y: 2 })).toEqual([
      { x: 2, y: 2 },
    ])
  })

  it('returns exposed solids with shortest paths to a standing cell', () => {
    const world = makeWorld(['#####', '.....', '..d..'])

    expect(findReachableExposedSolids(world, { x: 1, y: 1 })).toContainEqual({
      target: { x: 2, y: 2 },
      path: [{ x: 2, y: 1 }],
    })
  })

  it('does not return the same exposed solid more than once', () => {
    const world = makeWorld(['#####', '.....', '.ddd.', '.d.d.'])
    const targets = findReachableExposedSolids(world, { x: 2, y: 1 })
    const keys = targets.map(({ target }) => `${target.x}:${target.y}`)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('does not expose bedrock as a mining target', () => {
    const world = makeWorld(['bbbbb', '.....', '.....'])

    expect(
      findReachableExposedSolids(world, { x: 1, y: 1 }).some(
        ({ target }) => target.y === 0,
      ),
    ).toBe(false)
  })
})

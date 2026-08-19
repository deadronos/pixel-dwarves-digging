import { describe, expect, it } from 'vitest'
import { findPath, findReachableExposedSolids } from './pathfinding'
import type { Cell, World } from './types'

function makeWorld(rows: string[]): World {
  const height = rows.length
  const width = rows[0].length
  const cells: Cell[] = rows.flatMap((row) =>
    [...row].map((value) => ({
      block: value === '.' ? 'air' : value === 'stone' ? 'stone' : 'dirt',
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
  }
}

describe('findPath', () => {
  it('finds a shortest walkable path around solid blocks', () => {
    const world = makeWorld(['......', '.####.', '......'])

    expect(findPath(world, { x: 0, y: 1 }, { x: 5, y: 1 })).toEqual([
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 1 },
    ])
  })

  it('returns exposed solids with shortest paths to a standing cell', () => {
    const world = makeWorld(['......', '..d...', '......'])

    expect(findReachableExposedSolids(world, { x: 1, y: 1 })).toContainEqual({
      target: { x: 2, y: 1 },
      path: [],
    })
  })

  it('does not return the same exposed solid more than once', () => {
    const world = makeWorld(['.....', '.ddd.', '.d.d.', '.....'])
    const targets = findReachableExposedSolids(world, { x: 2, y: 3 })
    const keys = targets.map(({ target }) => `${target.x}:${target.y}`)

    expect(new Set(keys).size).toBe(keys.length)
  })
})

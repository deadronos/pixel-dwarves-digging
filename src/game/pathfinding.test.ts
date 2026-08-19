import { describe, expect, it } from 'vitest'
import { findPath } from './pathfinding'
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
})

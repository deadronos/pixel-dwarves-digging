import { describe, expect, it } from 'vitest'
import type { World } from '../types'
import { getBuildingById, getCompletedStorageBuildings } from './selectors'

const world = {
  width: 4,
  height: 4,
  seed: 'selectors',
  runNumber: 1,
  cells: Array.from({ length: 16 }, (_, index) => ({
    block: index < 4 ? 'stone' : 'air',
    biome: 'meadow' as const,
  })),
  surfaceHeights: [1, 1, 1, 1],
  biomes: ['meadow', 'meadow', 'meadow', 'meadow'] as const,
  start: { x: 1, y: 1 },
  stockpile: { x: 1, y: 1 },
  buildings: [
    {
      id: 'stockpile-1',
      type: 'stockpile' as const,
      position: { x: 1, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed' as const,
      storage: { capacity: 10, inventory: {} },
    },
    {
      id: 'depot-1',
      type: 'depot' as const,
      position: { x: 2, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned' as const,
    },
  ],
} satisfies World

describe('building selectors', () => {
  it('returns only completed buildings with storage', () => {
    expect(getCompletedStorageBuildings(world).map(({ id }) => id)).toEqual([
      'stockpile-1',
    ])
  })

  it('finds a building by id without changing its construction state', () => {
    expect(getBuildingById(world, 'depot-1')?.construction).toBe('planned')
  })
})

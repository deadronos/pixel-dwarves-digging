import { describe, expect, it } from 'vitest'
import {
  canPlaceBuilding,
  completeConstruction,
  getPrimaryStockpile,
  getStorageCapacity,
  reserveConstructionMaterials,
} from './buildings'
import { EMPTY_INVENTORY, type SimulationState, type World } from './types'

function makeBuildingState(): SimulationState {
  const width = 8
  const height = 6
  const cells = Array.from({ length: width * height }, (_, index) => {
    const y = Math.floor(index / width)
    return {
      block: y >= 3 ? ('stone' as const) : ('air' as const),
      biome: 'meadow' as const,
    }
  })
  const world: World = {
    width,
    height,
    cells,
    seed: 'building-fixture',
    runNumber: 1,
    surfaceHeights: Array(width).fill(2),
    biomes: Array(width).fill('meadow'),
    start: { x: 2, y: 2 },
    stockpile: { x: 1, y: 2 },
    buildings: [
      {
        id: 'stockpile-1',
        type: 'stockpile',
        position: { x: 1, y: 1 },
        width: 3,
        height: 2,
        level: 1,
        construction: 'completed',
        storage: { capacity: 120, inventory: { ...EMPTY_INVENTORY } },
      },
      {
        id: 'outpost-1',
        type: 'outpost',
        position: { x: 5, y: 2 },
        width: 2,
        height: 1,
        level: 1,
        construction: 'planned',
      },
    ],
  }

  return {
    world,
    dwarves: [],
    inventory: { ...EMPTY_INVENTORY, stone: 12 },
    policy: {
      workPreference: 'nearest',
      haulingPreference: 'nearest-stockpile',
      materialPriority: {
        coal: false,
        iron: false,
        crystal: false,
        relic: false,
      },
    },
    constructionOrders: [
      {
        id: 'outpost-order',
        buildingId: 'outpost-1',
        type: 'outpost',
        required: { stone: 12 },
        reserved: {},
        delivered: { stone: 12 },
        progress: 0,
        reason: 'outpost',
      },
    ],
    constructionPolicy: 'balanced',
    tick: 0,
    totalCleared: 0,
    completed: false,
    discoveredRelics: 0,
    prestigeCurrency: 0,
    upgrades: {
      toolPower: 0,
      moveSpeed: 0,
      satchel: 0,
      extraBunks: 0,
      prospecting: 0,
    },
  }
}

describe('building helpers', () => {
  it('finds the primary stockpile and reports finite capacity', () => {
    const state = makeBuildingState()

    expect(getPrimaryStockpile(state.world)?.level).toBe(1)
    expect(getStorageCapacity(state.world, 'stockpile-1')).toBe(120)
  })

  it('accepts a grounded outpost placement but rejects unsupported space', () => {
    const state = makeBuildingState()
    const placementWorld = {
      ...state.world,
      buildings: state.world.buildings.filter(
        (building) => building.type === 'stockpile',
      ),
    }

    expect(
      canPlaceBuilding(placementWorld, {
        type: 'outpost',
        position: { x: 5, y: 1 },
      }),
    ).toBe(true)
    expect(
      canPlaceBuilding(placementWorld, {
        type: 'outpost',
        position: { x: 5, y: 0 },
      }),
    ).toBe(false)
  })

  it('reserves and consumes construction stone exactly once', () => {
    const state = makeBuildingState()
    const reserved = reserveConstructionMaterials(state, 'outpost-order')
    const completed = completeConstruction(reserved, 'outpost-order')

    expect(completed.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'outpost',
        construction: 'completed',
      }),
    )
    expect(completed.inventory.stone).toBe(0)
  })
})

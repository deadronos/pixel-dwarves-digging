import { describe, expect, it } from 'vitest'
import { blockToId } from './blocks'
import {
  canPlaceBuilding,
  completeConstruction,
  getPrimaryStockpile,
  getStorageCapacity,
  reserveConstructionMaterials,
} from './buildings'
import { addMaterialToStorage } from './buildings/storage'
import { EMPTY_INVENTORY, type SimulationState, type World } from './types'

function makeBuildingState(): SimulationState {
  const width = 8
  const height = 6
  const cells = Array.from({ length: width * height }, (_, index) => {
    const y = Math.floor(index / width)
    return blockToId(y <= 2 ? ('stone' as const) : ('air' as const))
  })
  const world: World = {
    width,
    height,
    cells: Uint8Array.from(cells),
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
        position: { x: 5, y: 3 },
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
    accessRequests: [],
    worldRevision: 0,
    safety: { phase: 'operational', emergencyStone: 0 },
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
  it('adds carried material only to an available completed storage building', () => {
    const state = makeBuildingState()
    const world = addMaterialToStorage(state.world, 'stockpile-1', 'stone')

    expect(world).not.toBeNull()
    expect(world?.buildings[0].storage?.inventory.stone).toBe(1)
    expect(state.world.buildings[0].storage?.inventory.stone).toBe(0)
    expect(addMaterialToStorage(state.world, 'missing', 'stone')).toBeNull()
  })

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
        position: { x: 5, y: 3 },
      }),
    ).toBe(true)
    expect(
      canPlaceBuilding(placementWorld, {
        type: 'outpost',
        position: { x: 5, y: 4 },
      }),
    ).toBe(false)
  })

  it('allows bridges and ladders only when they have an anchor', () => {
    const state = makeBuildingState()
    const bridgeWorld = {
      ...state.world,
      buildings: [
        ...state.world.buildings,
        {
          id: 'bridge-anchor',
          type: 'bridge' as const,
          position: { x: 4, y: 3 },
          width: 1,
          height: 1,
          level: 1,
          construction: 'completed' as const,
        },
      ],
    }

    expect(
      canPlaceBuilding(bridgeWorld, {
        type: 'bridge',
        position: { x: 3, y: 3 },
      }),
    ).toBe(true)
    expect(
      canPlaceBuilding(state.world, {
        type: 'bridge',
        position: { x: 3, y: 3 },
      }),
    ).toBe(false)
    const ladderWorld = {
      ...state.world,
      cells: state.world.cells.slice(),
    }
    ladderWorld.cells[3 * state.world.width + 2] = blockToId('stone')
    expect(
      canPlaceBuilding(ladderWorld, {
        type: 'ladder',
        position: { x: 3, y: 3 },
      }),
    ).toBe(true)
  })

  it('allows a ladder directly below a completed ladder anchor', () => {
    const state = makeBuildingState()
    const position = { x: 4, y: 3 }
    const request = { type: 'ladder' as const, position }
    state.world.cells[2 * state.world.width + position.x] = blockToId('air')
    state.world.cells[5 * state.world.width + position.x] = blockToId('stone')
    expect(canPlaceBuilding(state.world, request)).toBe(false)

    const ladderWorld = {
      ...state.world,
      buildings: [
        ...state.world.buildings,
        {
          id: 'ladder-anchor',
          type: 'ladder' as const,
          position: { x: position.x, y: position.y + 1 },
          width: 1,
          height: 1,
          level: 1,
          construction: 'completed' as const,
        },
      ],
    }

    expect(canPlaceBuilding(ladderWorld, request)).toBe(true)
  })

  it('rejects planned footprints that overlap another planned building', () => {
    const state = makeBuildingState()
    const request = { type: 'outpost' as const, position: { x: 5, y: 3 } }
    expect(
      canPlaceBuilding(
        {
          ...state.world,
          buildings: state.world.buildings.filter(
            ({ id }) => id !== 'outpost-1',
          ),
        },
        request,
      ),
    ).toBe(true)
    expect(canPlaceBuilding(state.world, request)).toBe(false)
  })

  it('does not complete a planned building after a reservation conflict appears', () => {
    const state = makeBuildingState()
    state.world.buildings.push({
      id: 'late-conflict',
      type: 'outpost',
      position: { x: 6, y: 2 },
      width: 2,
      height: 2,
      level: 1,
      construction: 'planned',
    })

    const completed = completeConstruction(state, 'outpost-order')

    expect(completed.world.buildings).toContainEqual(
      expect.objectContaining({
        id: 'outpost-1',
        construction: 'planned',
      }),
    )
    expect(completed.constructionOrders).toContainEqual(
      expect.objectContaining({ id: 'outpost-order' }),
    )
  })

  it('reserves and consumes construction stone exactly once', () => {
    const state = makeBuildingState()
    const stockpile = getPrimaryStockpile(state.world)
    if (!stockpile?.storage) throw new Error('fixture stockpile missing')
    stockpile.storage.inventory = { stone: 20 }
    state.inventory.stone = 20
    state.constructionOrders[0].delivered.stone = 4
    state.constructionOrders[0].reserved.stone = 2

    const reserved = reserveConstructionMaterials(state, 'outpost-order')
    const retried = reserveConstructionMaterials(reserved, 'outpost-order')
    expect(retried.constructionOrders[0].reserved.stone).toBe(8)
    expect(retried.inventory.stone).toBe(14)
    expect(getPrimaryStockpile(retried.world)?.storage?.inventory.stone).toBe(
      14,
    )
    const delivered = {
      ...retried,
      constructionOrders: retried.constructionOrders.map((order) => ({
        ...order,
        reserved: {},
        delivered: { stone: 12 },
        progress: 12,
      })),
    }
    const completed = completeConstruction(delivered, 'outpost-order')

    expect(completed.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'outpost',
        construction: 'completed',
      }),
    )
    expect(completed.inventory.stone).toBe(14)
    expect(getPrimaryStockpile(completed.world)?.storage?.inventory.stone).toBe(
      14,
    )
    expect(completed.constructionOrders).toEqual([])
  })

  it('completes a storage upgrade without resetting stored inventory', () => {
    const state = makeBuildingState()
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile?.storage) throw new Error('fixture stockpile missing')
    stockpile.storage.inventory = { dirt: 12, stone: 8 }
    state.inventory = { ...EMPTY_INVENTORY, stone: 8, dirt: 12 }
    state.constructionOrders = [
      {
        id: 'stockpile-upgrade-order',
        buildingId: stockpile.id,
        type: 'stockpile',
        required: { stone: 8 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'storage-upgrade',
        targetLevel: 2,
      },
    ]

    const reserved = reserveConstructionMaterials(
      state,
      'stockpile-upgrade-order',
    )
    expect(reserved.inventory.stone).toBe(0)
    const delivered = {
      ...reserved,
      constructionOrders: reserved.constructionOrders.map((order) =>
        order.id === 'stockpile-upgrade-order'
          ? { ...order, reserved: {}, delivered: { stone: 8 }, progress: 8 }
          : order,
      ),
    }
    const completed = completeConstruction(delivered, 'stockpile-upgrade-order')
    const upgraded = completed.world.buildings.find(
      (building) => building.id === stockpile.id,
    )

    expect(upgraded).toMatchObject({
      level: 2,
      storage: { capacity: 144, inventory: { dirt: 12 } },
    })
    expect(completed.constructionOrders).toEqual([])
  })
})

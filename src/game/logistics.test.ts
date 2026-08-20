import { describe, expect, it } from 'vitest'
import { stepSimulation } from './engine'
import {
  assessDigSafety,
  getAggregateInventory,
  planAccessConstructionOrder,
  planExpansionOrder,
  selectStorageDestination,
} from './logistics'
import { EMPTY_INVENTORY, type SimulationState } from './types'

function makeStorageState(): SimulationState {
  const width = 6
  const height = 3
  const cells = [
    ...Array.from({ length: width }, () => ({
      block: 'stone' as const,
      biome: 'meadow' as const,
    })),
    { block: 'air' as const, biome: 'meadow' as const },
    { block: 'air' as const, biome: 'meadow' as const },
    { block: 'dirt' as const, biome: 'meadow' as const },
    { block: 'air' as const, biome: 'meadow' as const },
    { block: 'air' as const, biome: 'meadow' as const },
    { block: 'air' as const, biome: 'meadow' as const },
    { block: 'air' as const, biome: 'meadow' as const },
    ...Array.from({ length: width }, () => ({
      block: 'air' as const,
      biome: 'meadow' as const,
    })),
  ]
  return {
    world: {
      width,
      height,
      cells,
      seed: 'storage-fixture',
      runNumber: 1,
      surfaceHeights: Array(width).fill(0),
      biomes: Array(width).fill('meadow'),
      start: { x: 1, y: 1 },
      stockpile: { x: 0, y: 1 },
      buildings: [
        {
          id: 'stockpile-1',
          type: 'stockpile',
          position: { x: 0, y: 1 },
          width: 1,
          height: 1,
          level: 1,
          construction: 'completed',
          storage: { capacity: 120, inventory: {} },
        },
      ],
    },
    dwarves: [
      {
        id: 'dwarf-1',
        position: { x: 1, y: 1 },
        movement: 'grounded',
        task: { kind: 'idle', path: [], progress: 0 },
        carrying: null,
      },
    ],
    inventory: { ...EMPTY_INVENTORY },
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
    constructionOrders: [],
    constructionPolicy: 'balanced',
    accessRequests: [],
    worldRevision: 0,
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

function stepUntilCarrying(state: SimulationState): SimulationState {
  let current = state
  for (let index = 0; index < 20; index += 1) {
    current = stepSimulation(current, 1)
    if (current.dwarves[0].carrying) return current
  }
  return current
}

describe('logistics helpers', () => {
  it('plans an anchored reachable ladder for an access request', () => {
    const state = makeStorageState()
    state.world.cells[1 * state.world.width + 2] = {
      block: 'air',
      biome: 'meadow',
    }
    state.world.buildings.push({
      id: 'bridge-anchor',
      type: 'bridge',
      position: { x: 1, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
    })
    const request = {
      id: 'access-2-2',
      target: { x: 2, y: 2 },
      failure: 'support' as const,
      priority: 20,
      worldRevision: 0,
      status: 'open' as const,
    }
    state.accessRequests = [request]

    const planned = planAccessConstructionOrder(state, request)

    expect(planned.constructionOrders).toContainEqual(
      expect.objectContaining({
        type: 'ladder',
        reason: 'access',
        accessRequestId: request.id,
      }),
    )
  })

  it('marks a supported dig with a storage route as safe', () => {
    const state = makeStorageState()

    expect(assessDigSafety(state, { x: 1, y: 1 }, { x: 2, y: 1 })).toEqual({
      safe: true,
      storage: { id: 'stockpile-1', position: { x: 0, y: 1 } },
    })
  })

  it('rejects a dig that removes the dwarf support below its feet', () => {
    const state = makeStorageState()

    expect(assessDigSafety(state, { x: 1, y: 1 }, { x: 1, y: 0 })).toEqual({
      safe: false,
      failure: 'support',
    })
  })

  it('rejects mining when no storage building has capacity and a route', () => {
    const state = makeStorageState()
    state.world.buildings[0].storage = { capacity: 0, inventory: {} }

    expect(assessDigSafety(state, { x: 1, y: 1 }, { x: 2, y: 1 })).toEqual({
      safe: false,
      failure: 'storage-route',
    })
  })

  it('does not count a mined block as stored until deposit', () => {
    const state = makeStorageState()
    state.world.cells[1] = { block: 'bedrock', biome: 'meadow' }
    const afterMining = stepUntilCarrying(state)
    const stockpile = afterMining.world.buildings[0]

    expect(afterMining.dwarves[0].carrying).toBe('dirt')
    expect(getAggregateInventory(afterMining).dirt).toBe(1)
    expect(stockpile.storage?.inventory.dirt ?? 0).toBe(0)
  })

  it('redirects a haul to an outpost when the main stockpile is full', () => {
    const state = makeStorageState()
    state.world.buildings[0].storage = {
      capacity: 120,
      inventory: { stone: 120 },
    }
    state.world.buildings.push({
      id: 'outpost-1',
      type: 'outpost',
      position: { x: 4, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
      storage: { capacity: 48, inventory: {} },
    })

    expect(selectStorageDestination(state, 'stone', { x: 3, y: 1 })).toEqual({
      id: 'outpost-1',
      position: { x: 4, y: 1 },
    })
  })

  it('plans one remote outpost when expansion policy has enough stone', () => {
    const state = makeStorageState()
    state.constructionPolicy = 'expand'
    state.inventory.stone = 12

    const planned = planExpansionOrder(state)

    expect(planned.constructionOrders).toHaveLength(1)
    expect(planned.constructionOrders[0].reason).toBe('outpost')
    expect(planned.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'outpost',
        construction: 'planned',
      }),
    )
  })
})

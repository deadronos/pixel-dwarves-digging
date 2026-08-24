import { describe, expect, it } from 'vitest'
import { stepSimulation } from './engine'
import {
  assessDigSafety,
  getAggregateInventory,
  getAvailableConstructionMaterial,
  isBootstrapProtectedTarget,
  planAccessConstructionOrder,
  planExpansionOrder,
  planOverflowDepotOrder,
  recoverStaleOutpostOrders,
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

function stepUntilCarrying(state: SimulationState): SimulationState {
  let current = state
  for (let index = 0; index < 20; index += 1) {
    current = stepSimulation(current, 1)
    if (current.dwarves[0].carrying) return current
  }
  return current
}

describe('logistics helpers', () => {
  it('prioritizes the main stockpile for nearest-stockpile hauling', () => {
    const state = makeStorageState()
    state.world.cells[1 * state.world.width + 2] = {
      block: 'air',
      biome: 'meadow',
    }
    state.dwarves[0].position = { x: 3, y: 1 }
    state.world.buildings.push({
      id: 'outpost-1',
      type: 'outpost',
      position: { x: 2, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
      storage: { capacity: 48, inventory: {} },
    })

    const destination = selectStorageDestination(
      state,
      'dirt',
      state.dwarves[0].position,
      state.dwarves[0].id,
    )

    expect(destination?.id).toBe('stockpile-1')
  })

  it('finishes a dwarf current haul route before choosing another storage', () => {
    const state = makeStorageState()
    state.world.cells[1 * state.world.width + 2] = {
      block: 'air',
      biome: 'meadow',
    }
    state.policy.haulingPreference = 'finish-current-route'
    state.dwarves[0].position = { x: 3, y: 1 }
    state.dwarves[0].carrying = 'dirt'
    state.dwarves[0].task = {
      kind: 'haul',
      target: { x: 2, y: 1 },
      path: [],
      progress: 0,
      block: 'dirt',
      buildingId: 'outpost-1',
    }
    state.world.buildings.push({
      id: 'outpost-1',
      type: 'outpost',
      position: { x: 2, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
      storage: { capacity: 48, inventory: {} },
    })

    const destination = selectStorageDestination(
      state,
      'dirt',
      state.dwarves[0].position,
      state.dwarves[0].id,
    )

    expect(destination?.id).toBe('outpost-1')
  })

  it('plans an anchored reachable ladder for an access request', () => {
    const state = makeStorageState()
    state.inventory.stone = 1
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

  it('plans a ladder from common material when no stone is available', () => {
    const state = makeStorageState()
    state.inventory.dirt = 1
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
      id: 'access-dirt-ladder',
      target: { x: 2, y: 2 },
      failure: 'support' as const,
      priority: 20,
      worldRevision: 0,
      status: 'open' as const,
    }

    const planned = planAccessConstructionOrder(
      { ...state, accessRequests: [request] },
      request,
    )

    expect(planned.constructionOrders[0]?.required).toEqual({ dirt: 1 })
  })

  it('protects the starter foundation while leaving the side tunnel available', () => {
    const state = makeStorageState()
    state.safety = { phase: 'bootstrap', emergencyStone: 1 }

    expect(isBootstrapProtectedTarget(state, { x: 1, y: 0 })).toBe(true)
    expect(isBootstrapProtectedTarget(state, { x: 2, y: 1 })).toBe(false)
  })

  it('keeps reserved emergency stone out of ordinary construction material', () => {
    const state = makeStorageState()
    state.inventory.stone = 2
    state.safety = { phase: 'bootstrap', emergencyStone: 1 }

    expect(getAvailableConstructionMaterial(state, 'stone')).toBe(1)

    state.constructionOrders = [
      {
        id: 'promised-ladder-order',
        buildingId: 'promised-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'access',
      },
    ]
    expect(getAvailableConstructionMaterial(state, 'stone')).toBe(0)
  })

  it('keeps an unfunded access request visible without creating an order', () => {
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
      id: 'access-waiting',
      target: { x: 2, y: 2 },
      failure: 'support' as const,
      priority: 20,
      worldRevision: 0,
      status: 'open' as const,
    }
    state.accessRequests = [request]

    const planned = planAccessConstructionOrder(state, request)

    expect(planned.constructionOrders).toEqual([])
    expect(planned.accessRequests[0].blockedReason).toBe('waiting-for-stone')

    const fundedInput = {
      ...planned,
      inventory: { ...planned.inventory, stone: 1 },
    }
    const funded = planAccessConstructionOrder(
      fundedInput,
      fundedInput.accessRequests[0],
    )
    expect(funded.constructionOrders).toHaveLength(1)
    expect(funded.accessRequests[0].blockedReason).toBeUndefined()
  })

  it('marks a supported dig with a storage route as safe', () => {
    const state = makeStorageState()

    expect(assessDigSafety(state, { x: 1, y: 1 }, { x: 2, y: 1 })).toEqual({
      safe: true,
      storage: { id: 'stockpile-1', position: { x: 0, y: 1 } },
    })
  })

  it('reuses safety results for the same world and reservations', () => {
    const state = makeStorageState()
    const first = assessDigSafety(state, { x: 1, y: 1 }, { x: 2, y: 1 })
    const second = assessDigSafety(state, { x: 1, y: 1 }, { x: 2, y: 1 })

    expect(second).toBe(first)
  })

  it('uses the virtually cleared target when checking the return route', () => {
    const state = makeStorageState()
    state.dwarves[0].position = { x: 3, y: 1 }

    expect(assessDigSafety(state, { x: 3, y: 1 }, { x: 2, y: 1 })).toEqual({
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

  it('redirects a full stockpile haul to a physical overflow depot', () => {
    const state = makeStorageState()
    state.world.buildings[0].storage = {
      capacity: 120,
      inventory: { stone: 120 },
    }
    state.world.buildings.push({
      id: 'depot-1',
      type: 'depot',
      position: { x: 4, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
      storage: { capacity: 24, inventory: {} },
    })

    expect(selectStorageDestination(state, 'stone', { x: 3, y: 1 })).toEqual({
      id: 'depot-1',
      position: { x: 4, y: 1 },
    })
  })

  it('reserves the last storage slot for an active haul', () => {
    const state = makeStorageState()
    state.world.buildings[0].storage = { capacity: 1, inventory: {} }
    state.dwarves = [
      {
        ...state.dwarves[0],
        carrying: 'dirt',
        task: {
          kind: 'haul',
          target: { x: 0, y: 1 },
          path: [],
          progress: 0,
          block: 'dirt',
          buildingId: 'stockpile-1',
        },
      },
      {
        ...state.dwarves[0],
        id: 'dwarf-2',
        position: { x: 2, y: 1 },
      },
    ]

    expect(
      selectStorageDestination(state, 'stone', { x: 2, y: 1 }, 'dwarf-2'),
    ).toBeNull()
  })

  it('plans one remote outpost when expansion policy has enough stone', () => {
    const state = makeStorageState()
    state.constructionPolicy = 'expand'
    state.inventory.stone = 12
    state.world.cells[1 * state.world.width + 2] = {
      block: 'air',
      biome: 'meadow',
    }

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

  it('does not plan an outpost when its construction site is unreachable', () => {
    const state = makeStorageState()
    state.constructionPolicy = 'expand'
    state.inventory.stone = 12

    expect(planExpansionOrder(state).constructionOrders).toEqual([])
  })

  it('plans a reachable overflow depot when storage is nearly full', () => {
    const state = makeStorageState()
    state.inventory.stone = 4
    state.world.buildings[0].storage = {
      capacity: 120,
      inventory: { stone: 116, dirt: 4 },
    }

    const planned = planOverflowDepotOrder(state)

    expect(planned.constructionOrders).toContainEqual(
      expect.objectContaining({
        type: 'depot',
        reason: 'capacity',
        required: { stone: 4 },
      }),
    )
    expect(planned.world.buildings).toContainEqual(
      expect.objectContaining({ type: 'depot', construction: 'planned' }),
    )
  })

  it('plans an overflow depot on an alternate perimeter cell', () => {
    const state = makeStorageState()
    state.world.height = 5
    state.world.cells = Array.from({ length: state.world.width * 5 }, (_, index) => {
      const y = Math.floor(index / state.world.width)
      return {
        block: y === 0 ? ('stone' as const) : ('air' as const),
        biome: 'meadow' as const,
      }
    })
    state.world.stockpile = { x: 1, y: 1 }
    state.world.buildings[0] = {
      ...state.world.buildings[0],
      position: { x: 1, y: 1 },
      width: 3,
      height: 2,
      storage: {
        capacity: 120,
        inventory: { stone: 116, dirt: 4 },
      },
    }
    state.dwarves[0].position = { x: 4, y: 2 }
    state.inventory.stone = 4

    for (const position of [
      { x: 4, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 1, y: 0 },
    ]) {
      state.world.cells[position.y * state.world.width + position.x] = {
        block: 'stone',
        biome: 'meadow',
      }
    }

    const planned = planOverflowDepotOrder(state)

    expect(planned.constructionOrders).toHaveLength(1)
    expect(planned.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'depot',
        construction: 'planned',
        position: { x: 2, y: 3 },
      }),
    )
  })

  it('recovers an unreachable planned outpost without losing its reservation', () => {
    const state = makeStorageState()
    state.inventory.stone = 0
    state.world.buildings.push({
      id: 'outpost-stale',
      type: 'outpost',
      position: { x: 4, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'outpost-stale-order',
        buildingId: 'outpost-stale',
        type: 'outpost',
        required: { stone: 4 },
        reserved: { stone: 4 },
        delivered: {},
        progress: 0,
        reason: 'outpost',
      },
    ]

    const recovered = recoverStaleOutpostOrders(state)

    expect(recovered.world.buildings).not.toContainEqual(
      expect.objectContaining({ id: 'outpost-stale' }),
    )
    expect(recovered.constructionOrders).toEqual([])
    expect(recovered.inventory.stone).toBe(4)
  })
})

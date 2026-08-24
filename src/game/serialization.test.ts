import { describe, expect, it } from 'vitest'
import { parseSave, serializeState } from './serialization'
import { EMPTY_INVENTORY, type SimulationState } from './types'

function makeState(): SimulationState {
  return {
    world: {
      width: 2,
      height: 2,
      cells: [
        { block: 'air', biome: 'meadow' },
        { block: 'dirt', biome: 'meadow' },
        { block: 'air', biome: 'meadow' },
        { block: 'stone', biome: 'meadow' },
      ],
      seed: 'round-trip',
      runNumber: 3,
      surfaceHeights: [1, 1],
      biomes: ['meadow', 'meadow'],
      start: { x: 0, y: 0 },
      stockpile: { x: 0, y: 0 },
      buildings: [],
    },
    dwarves: [],
    inventory: { ...EMPTY_INVENTORY, dirt: 3 },
    policy: {
      workPreference: 'deepest-first',
      haulingPreference: 'finish-current-route',
      materialPriority: {
        coal: true,
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
    tick: 12,
    totalCleared: 3,
    completed: false,
    discoveredRelics: 0,
    prestigeCurrency: 7,
    upgrades: {
      toolPower: 0,
      moveSpeed: 0,
      satchel: 1,
      extraBunks: 0,
      prospecting: 0,
    },
  }
}

describe('serialization', () => {
  it('round-trips a complete simulation state through JSON', () => {
    const original = makeState()

    expect(parseSave(serializeState(original))).toEqual({ state: original })
  })

  it('migrates a schema-two world to schema three with a bedrock floor', () => {
    const current = makeState()
    const {
      accessRequests: _accessRequests,
      worldRevision: _worldRevision,
      ...legacyState
    } = current
    const result = parseSave(
      JSON.stringify({ schemaVersion: 2, state: legacyState }),
    )

    expect(result).toEqual({
      state: expect.objectContaining({
        accessRequests: [],
        worldRevision: 0,
        world: expect.objectContaining({
          cells: [
            expect.objectContaining({ block: 'bedrock' }),
            expect.objectContaining({ block: 'bedrock' }),
            expect.objectContaining({ block: 'air' }),
            expect.objectContaining({ block: 'stone' }),
          ],
        }),
      }),
    })
  })

  it('round-trips access and recovery state in schema three', () => {
    const original = makeState()
    original.accessRequests = [
      {
        id: 'access-1-0',
        target: { x: 1, y: 0 },
        failure: 'support',
        priority: 20,
        worldRevision: 2,
        status: 'open',
      },
    ]
    original.worldRevision = 2
    original.dwarves = [
      {
        id: 'dwarf-1',
        position: { x: 0, y: 1 },
        movement: 'stranded',
        task: {
          kind: 'idle',
          path: [],
          progress: 0,
          purpose: 'recovery',
          recoveryReason: 'stranded',
        },
        carrying: null,
      },
    ]

    expect(parseSave(serializeState(original))).toEqual({ state: original })
  })

  it('round-trips a storage-full safety state', () => {
    const original = makeState()
    original.safety = {
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'storage-full',
      noProgressTicks: 20,
    }

    expect(parseSave(serializeState(original))).toEqual({ state: original })
  })

  it('migrates a schema-three save without safety state into bootstrap recovery state', () => {
    const current = makeState()
    const { safety: _safety, ...legacyState } = current

    const result = parseSave(
      JSON.stringify({ schemaVersion: 3, state: legacyState }),
    )

    expect(result).toEqual({
      state: expect.objectContaining({
        safety: { phase: 'bootstrap', emergencyStone: 0 },
      }),
    })
  })

  it('rejects malformed or unsupported saves', () => {
    expect(parseSave('{ nope')).toEqual({
      error: 'Save file is not valid JSON.',
    })
    expect(parseSave(JSON.stringify({ schemaVersion: 99 }))).toEqual({
      error: 'Save version is not supported.',
    })
  })

  it('rejects semantically invalid nested save records', () => {
    const invalidBuilding = makeState()
    invalidBuilding.world.buildings = [
      {
        id: 'invalid-building',
        type: 'not-real' as never,
        position: { x: 0, y: 0 },
        width: -1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]
    expect(
      parseSave(JSON.stringify({ schemaVersion: 4, state: invalidBuilding })),
    ).toEqual({ error: 'Save file is missing required simulation data.' })

    const invalidDwarf = makeState()
    invalidDwarf.dwarves = [{} as never]
    expect(
      parseSave(JSON.stringify({ schemaVersion: 4, state: invalidDwarf })),
    ).toEqual({ error: 'Save file is missing required simulation data.' })

    const invalidCell = makeState()
    invalidCell.world.cells[0] = {
      block: 'not-real' as never,
      biome: 'meadow',
    }
    expect(
      parseSave(JSON.stringify({ schemaVersion: 4, state: invalidCell })),
    ).toEqual({ error: 'Save file is missing required simulation data.' })

    const invalidTask = makeState()
    invalidTask.dwarves = [
      {
        ...invalidTask.dwarves[0],
        task: { kind: 'haul', path: [], progress: 0 },
      },
    ]
    expect(
      parseSave(JSON.stringify({ schemaVersion: 4, state: invalidTask })),
    ).toEqual({ error: 'Save file is missing required simulation data.' })
  })

  it('rejects construction orders that reference missing buildings', () => {
    const state = makeState()
    state.constructionOrders = [
      {
        id: 'missing-building-order',
        buildingId: 'missing-building',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]

    expect(parseSave(JSON.stringify({ schemaVersion: 4, state }))).toEqual({
      error: 'Save file is missing required simulation data.',
    })
  })

  it('repairs an orphaned schema-four access order and reports the recovery', () => {
    const state = makeState()
    state.world.buildings.push({
      id: 'orphaned-access-ladder',
      type: 'ladder',
      position: { x: 1, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'orphaned-access-order',
        buildingId: 'orphaned-access-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'access',
        accessRequestId: 'missing-access-request',
      },
    ]

    const result = parseSave(JSON.stringify({ schemaVersion: 4, state }))

    expect(result).toEqual({
      state: expect.objectContaining({
        constructionOrders: [],
        world: expect.objectContaining({
          buildings: [],
        }),
      }),
      recoveredAccessOrders: 1,
    })
  })

  it('repairs an orphaned access order whose planned building is missing', () => {
    const state = makeState()
    state.constructionOrders = [
      {
        id: 'missing-access-building-order',
        buildingId: 'missing-access-building',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'access',
        accessRequestId: 'missing-access-request',
      },
    ]

    const result = parseSave(JSON.stringify({ schemaVersion: 4, state }))

    expect(result).toEqual({
      state: expect.objectContaining({ constructionOrders: [] }),
      recoveredAccessOrders: 1,
    })
  })

  it('rejects an orphaned access order when reserved material cannot be returned', () => {
    const state = makeState()
    state.world.buildings = [
      {
        id: 'stockpile-1',
        type: 'stockpile',
        position: { x: 0, y: 0 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
        storage: { capacity: 1, inventory: { stone: 1 } },
      },
      {
        id: 'orphaned-access-ladder',
        type: 'ladder',
        position: { x: 1, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'planned',
      },
    ]
    state.constructionOrders = [
      {
        id: 'orphaned-access-order',
        buildingId: 'orphaned-access-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: { stone: 1 },
        delivered: {},
        progress: 0,
        reason: 'access',
        accessRequestId: 'missing-access-request',
      },
    ]

    expect(parseSave(JSON.stringify({ schemaVersion: 4, state }))).toEqual({
      error: 'Save file is missing required simulation data.',
    })
  })

  it('migrates a version-one global inventory into the main stockpile', () => {
    const current = makeState()
    const { buildings: _buildings, ...legacyWorld } = {
      ...current.world,
      width: 4,
      height: 3,
      cells: Array.from({ length: 12 }, (_, index) => ({
        block: index === 0 ? ('bedrock' as const) : ('air' as const),
        biome: 'meadow' as const,
      })),
      surfaceHeights: [1, 1, 1, 1],
      biomes: ['meadow', 'meadow', 'meadow', 'meadow'] as const,
      start: { x: 1, y: 1 },
      stockpile: { x: 0, y: 1 },
    }
    const legacyPayload = JSON.stringify({
      schemaVersion: 1,
      state: {
        ...current,
        world: legacyWorld,
        dwarves: [],
        inventory: { ...EMPTY_INVENTORY, dirt: 3 },
      },
    })

    const result = parseSave(legacyPayload)

    expect('state' in result).toBe(true)
    if ('state' in result) {
      const stockpile = result.state.world.buildings.find(
        (building) => building.type === 'stockpile',
      )
      expect(stockpile?.storage?.inventory.dirt).toBe(3)
      expect(result.state.constructionOrders).toEqual([])
      expect(result.state.constructionPolicy).toBe('balanced')
    }
  })
})

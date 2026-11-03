import { describe, expect, it } from 'vitest'
import { blockToId, cellsFromBlocks, encodeCells, idToBlock } from './blocks'
import { parseSave, SAVE_VERSION, serializeState } from './serialization'
import { createInitialSimulation } from './state'
import { EMPTY_INVENTORY, type SimulationState } from './types'

/** Serializes like schema 4: Uint8Array cells become `{ block, biome }[]`. */
function legacyJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item instanceof Uint8Array
      ? Array.from(item, (id) => ({ block: idToBlock(id), biome: 'meadow' }))
      : item,
  )
}

function makeState(): SimulationState {
  return {
    world: {
      width: 2,
      height: 2,
      cells: Uint8Array.from([
        blockToId('air'),
        blockToId('dirt'),
        blockToId('air'),
        blockToId('stone'),
      ]),
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
      legacyJson({ schemaVersion: 2, state: legacyState }),
    )

    expect(result).toEqual({
      state: expect.objectContaining({
        accessRequests: [],
        worldRevision: 0,
        world: expect.objectContaining({
          cells: cellsFromBlocks(['bedrock', 'bedrock', 'air', 'stone']),
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

  it('round-trips per-dwarf no-progress state', () => {
    const original = makeState()
    original.dwarves = [
      {
        id: 'dwarf-1',
        position: { x: 0, y: 0 },
        movement: 'stranded',
        task: {
          kind: 'idle',
          path: [],
          progress: 0,
          purpose: 'recovery',
          recoveryReason: 'stranded',
        },
        carrying: null,
        noProgressTicks: 7,
      },
    ]

    expect(parseSave(serializeState(original))).toEqual({ state: original })
  })

  it('rejects a negative per-dwarf no-progress counter', () => {
    const original = makeState()
    original.dwarves = [
      {
        id: 'dwarf-1',
        position: { x: 0, y: 0 },
        movement: 'grounded',
        task: { kind: 'idle', path: [], progress: 0 },
        carrying: null,
        noProgressTicks: -1,
      },
    ]

    expect(
      parseSave(legacyJson({ schemaVersion: 4, state: original })),
    ).toEqual({
      error: 'Save file is missing required simulation data.',
    })
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
      legacyJson({ schemaVersion: 3, state: legacyState }),
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
    expect(parseSave(legacyJson({ schemaVersion: 99 }))).toEqual({
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
      parseSave(legacyJson({ schemaVersion: 4, state: invalidBuilding })),
    ).toEqual({ error: 'Save file is missing required simulation data.' })

    const invalidDwarf = makeState()
    invalidDwarf.dwarves = [{} as never]
    expect(
      parseSave(legacyJson({ schemaVersion: 4, state: invalidDwarf })),
    ).toEqual({ error: 'Save file is missing required simulation data.' })

    const invalidCell = JSON.parse(
      legacyJson({ schemaVersion: 4, state: makeState() }),
    )
    invalidCell.state.world.cells[0] = { block: 'not-real', biome: 'meadow' }
    expect(parseSave(JSON.stringify(invalidCell))).toEqual({
      error: 'Save terrain data has an invalid cell at 0.',
    })

    const invalidTask = makeState()
    invalidTask.dwarves = [
      {
        ...invalidTask.dwarves[0],
        task: { kind: 'haul', path: [], progress: 0 },
      },
    ]
    expect(
      parseSave(legacyJson({ schemaVersion: 4, state: invalidTask })),
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

    expect(parseSave(legacyJson({ schemaVersion: 4, state }))).toEqual({
      error: 'Save file is missing required simulation data.',
    })
  })

  it('round-trips a pending storage upgrade against a completed storage building', () => {
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
        storage: { capacity: 120, inventory: { dirt: 4 } },
      },
    ]
    state.constructionOrders = [
      {
        id: 'stockpile-upgrade-order',
        buildingId: 'stockpile-1',
        type: 'stockpile',
        required: { stone: 8 },
        reserved: { stone: 8 },
        delivered: {},
        progress: 0,
        reason: 'storage-upgrade',
        targetLevel: 2,
      },
    ]

    const result = parseSave(legacyJson({ schemaVersion: 4, state }))

    expect(result).toEqual({
      state: expect.objectContaining({
        constructionOrders: [
          expect.objectContaining({
            type: 'stockpile',
            reason: 'storage-upgrade',
            targetLevel: 2,
          }),
        ],
      }),
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

    const result = parseSave(legacyJson({ schemaVersion: 4, state }))

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

    const result = parseSave(legacyJson({ schemaVersion: 4, state }))

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

    expect(parseSave(legacyJson({ schemaVersion: 4, state }))).toEqual({
      error: 'Save file is missing required simulation data.',
    })
  })

  it('migrates a version-one global inventory into the main stockpile', () => {
    const current = makeState()
    const { buildings: _buildings, ...legacyWorld } = {
      ...current.world,
      width: 4,
      height: 3,
      cells: Uint8Array.from({ length: 12 }, (_, index) =>
        blockToId(index === 0 ? 'bedrock' : 'air'),
      ),
      surfaceHeights: [1, 1, 1, 1],
      biomes: ['meadow', 'meadow', 'meadow', 'meadow'] as const,
      start: { x: 1, y: 1 },
      stockpile: { x: 0, y: 1 },
    }
    const legacyPayload = legacyJson({
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

  it('rejects saves with malformed non-object topologyKey', () => {
    const current = makeState()
    const payload = legacyJson({
      schemaVersion: 4,
      state: {
        ...current,
        world: {
          ...current.world,
          topologyKey: 1,
        },
      },
    })

    const result = parseSave(payload)
    expect(result).toEqual({
      error: 'Save file is missing required simulation data.',
    })
  })

  it('strips stray saveStatus from polluted simulation state on import and re-export', () => {
    const original = makeState()
    const pollutedPayload = legacyJson({
      schemaVersion: 4,
      state: {
        ...original,
        saveStatus: 'DIRTY',
      },
    })

    const result = parseSave(pollutedPayload)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(
        'saveStatus' in (result.state as unknown as Record<string, unknown>),
      ).toBe(false)
      expect(result.state).toEqual(original)

      const reExported = JSON.parse(serializeState(result.state)) as {
        state: Record<string, unknown>
      }
      expect('saveStatus' in reExported.state).toBe(false)
    }
  })

  it('writes schema five with compact base64 cells and no per-cell biome', () => {
    const original = makeState()
    const parsed = JSON.parse(serializeState(original))

    expect(parsed.schemaVersion).toBe(SAVE_VERSION)
    expect(SAVE_VERSION).toBe(5)
    expect(parsed.state.world.cells).toBe(encodeCells(original.world.cells))
    expect(typeof parsed.state.world.cells).toBe('string')
  })

  it('round-trips a generated world byte for byte', () => {
    const original = createInitialSimulation('save-roundtrip')
    original.world.cells[5] = blockToId('relic')

    const result = parseSave(serializeState(original))

    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.world.cells).toBeInstanceOf(Uint8Array)
      expect(result.state.world.cells).toEqual(original.world.cells)
      expect(serializeState(result.state)).toBe(serializeState(original))
    }
  })

  it('loads a schema-four save with object cells into schema five', () => {
    const original = makeState()
    const result = parseSave(legacyJson({ schemaVersion: 4, state: original }))

    expect(result).toEqual({ state: original })
    if ('state' in result) {
      expect(result.state.world.cells).toBeInstanceOf(Uint8Array)
      expect(JSON.parse(serializeState(result.state)).schemaVersion).toBe(5)
    }
  })

  it('rejects corrupt schema-five cell data with a clear error', () => {
    const base = JSON.parse(serializeState(makeState()))
    const withCells = (cells: unknown) =>
      JSON.stringify({
        ...base,
        state: { ...base.state, world: { ...base.state.world, cells } },
      })

    expect(parseSave(withCells('!!not base64!!'))).toEqual({
      error: 'Save terrain data is not valid base64.',
    })
    expect(parseSave(withCells(btoa('\u0000\u0001')))).toEqual({
      error: 'Save terrain data has 2 cells, expected 4.',
    })
    expect(parseSave(withCells(btoa('\u0000\u0001\u0063\u0000')))).toEqual({
      error: 'Save terrain data has unknown block id 99 at cell 2.',
    })
    expect(parseSave(withCells(12))).toEqual({
      error: 'Save terrain data must be a base64 string.',
    })
  })

  it('rejects a schema-four save whose cell array has the wrong length', () => {
    const base = JSON.parse(
      legacyJson({ schemaVersion: 4, state: makeState() }),
    )
    base.state.world.cells.pop()

    expect(parseSave(JSON.stringify(base))).toEqual({
      error: 'Save terrain data has the wrong number of cells, expected 4.',
    })
  })
})

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

  it('migrates a version-one global inventory into the main stockpile', () => {
    const current = makeState()
    const { buildings: _buildings, ...legacyWorld } = current.world
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

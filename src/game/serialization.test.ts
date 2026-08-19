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

  it('rejects malformed or unsupported saves', () => {
    expect(parseSave('{ nope')).toEqual({
      error: 'Save file is not valid JSON.',
    })
    expect(parseSave(JSON.stringify({ schemaVersion: 99 }))).toEqual({
      error: 'Save version is not supported.',
    })
  })
})

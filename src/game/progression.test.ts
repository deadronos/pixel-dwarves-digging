import { describe, expect, it } from 'vitest'
import { startPrestige } from './progression'
import { EMPTY_INVENTORY, type SimulationState } from './types'

function makeState(): SimulationState {
  return {
    world: {
      width: 4,
      height: 3,
      cells: Array.from({ length: 12 }, () => ({
        block: 'air',
        biome: 'meadow',
      })),
      seed: 'test-seed',
      runNumber: 2,
      surfaceHeights: [1, 1, 1, 1],
      biomes: ['meadow', 'meadow', 'meadow', 'meadow'],
      start: { x: 1, y: 1 },
      stockpile: { x: 1, y: 1 },
      buildings: [],
    },
    dwarves: [],
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
    tick: 500,
    totalCleared: 120,
    completed: true,
    discoveredRelics: 1,
    prestigeCurrency: 14,
    upgrades: {
      toolPower: 2,
      moveSpeed: 1,
      satchel: 0,
      extraBunks: 1,
      prospecting: 0,
    },
  }
}

describe('startPrestige', () => {
  it('awards a full-clear prestige and preserves permanent upgrades', () => {
    const result = startPrestige(makeState(), 'full-clear')

    expect(result.prestigeCurrency).toBeGreaterThan(14)
    expect(result.upgrades).toEqual(makeState().upgrades)
    expect(result.world.runNumber).toBe(3)
    expect(result.completed).toBe(false)
    expect(result.totalCleared).toBe(0)
    expect(result.dwarves.length).toBe(4)
    expect(result.accessRequests).toEqual([])
    expect(result.worldRevision).toBe(0)
  })

  it('allows a relic discovery to grant an early-prestige reward', () => {
    const state = makeState()
    const result = startPrestige(
      { ...state, completed: false, discoveredRelics: 1 },
      'relic',
    )

    expect(result.prestigeCurrency).toBeGreaterThan(state.prestigeCurrency)
    expect(result.world.runNumber).toBe(3)
  })
})

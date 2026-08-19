import { describe, expect, it } from 'vitest'
import { stepSimulation } from './engine'
import {
  type Cell,
  EMPTY_INVENTORY,
  type SimulationState,
  type World,
} from './types'

function makeState(rows: string[]): SimulationState {
  const height = rows.length
  const width = rows[0].length
  const cells: Cell[] = rows.flatMap((row) =>
    [...row].map((value) => ({
      block: value === '.' ? 'air' : value === 'I' ? 'iron' : 'dirt',
      biome: 'meadow',
    })),
  )
  const world: World = {
    width,
    height,
    cells,
    seed: 'fixture',
    runNumber: 1,
    surfaceHeights: Array(width).fill(1),
    biomes: Array(width).fill('meadow'),
    start: { x: 1, y: 1 },
    stockpile: { x: 1, y: 1 },
  }

  return {
    world,
    dwarves: [
      {
        id: 'dwarf-1',
        position: { x: 1, y: 1 },
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

describe('stepSimulation', () => {
  it('moves, digs, hauls, and increments global inventory', () => {
    const initial = makeState(['.....', '..d..', '.....'])
    const result = stepSimulation(initial, 30)

    expect(result.inventory.dirt).toBe(1)
    expect(result.totalCleared).toBe(1)
    expect(result.world.cells[1 * result.world.width + 2].block).toBe('air')
    expect(result.dwarves[0].position).toEqual(result.world.stockpile)
    expect(result.dwarves[0].carrying).toBeNull()
  })

  it('uses ore-first policy when an ore target is exposed', () => {
    const initial = makeState(['.....', '..dI.', '.....'])
    const policyState = {
      ...initial,
      policy: {
        ...initial.policy,
        workPreference: 'ore-first' as const,
        materialPriority: { ...initial.policy.materialPriority, iron: true },
      },
    }

    const result = stepSimulation(policyState, 1)

    expect(result.dwarves[0].task.kind).toBe('dig')
    expect(result.dwarves[0].task.target).toEqual({ x: 3, y: 1 })
  })

  it('reports completed when every solid block is air', () => {
    const initial = makeState(['.....', '.....', '.....'])

    expect(stepSimulation(initial, 1).completed).toBe(true)
  })
})

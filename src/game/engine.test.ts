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
    buildings: [],
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
    constructionOrders: [],
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

  it('applies tool and movement upgrades to active dwarves', () => {
    const toolState = makeState(['.....', '..d..', '.....'])
    const upgradedToolState = {
      ...toolState,
      upgrades: { ...toolState.upgrades, toolPower: 2 },
    }
    expect(stepSimulation(upgradedToolState, 2).totalCleared).toBe(1)

    const movementState = makeState(['........', '.....d..', '........'])
    const upgradedMovementState = {
      ...movementState,
      upgrades: { ...movementState.upgrades, moveSpeed: 2 },
    }
    const moved = stepSimulation(upgradedMovementState, 2)
    expect(moved.dwarves[0].position.x).toBe(4)
  })

  it('preserves the world reference during movement-only ticks', () => {
    const initial = makeState(['........', '.....d..', '........'])
    const assigned = stepSimulation(initial, 1)
    const moved = stepSimulation(assigned, 1)

    expect(moved.world).toBe(assigned.world)
    expect(moved.world.cells).toBe(assigned.world.cells)
  })

  it('reserves different exposed targets for dwarves assigned in one tick', () => {
    const initial = makeState(['.....', '..dd.', '.....'])
    const secondDwarf = {
      ...initial.dwarves[0],
      id: 'dwarf-2',
    }
    const twoDwarves = {
      ...initial,
      dwarves: [initial.dwarves[0], secondDwarf],
    }

    const result = stepSimulation(twoDwarves, 1)
    const targets = result.dwarves.map((dwarf) => dwarf.task.target)

    expect(
      new Set(targets.map((target) => `${target?.x}:${target?.y}`)).size,
    ).toBe(2)
  })
})

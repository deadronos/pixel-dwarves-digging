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
  const supportBuildings = [
    ...Array.from({ length: width }, (_, x) => ({
      id: `bridge-${x}`,
      type: 'bridge' as const,
      position: { x, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed' as const,
    })),
    {
      id: 'stockpile-1',
      type: 'stockpile' as const,
      position: { x: 1, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed' as const,
      storage: { capacity: 120, inventory: {} },
    },
  ]
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
    buildings: supportBuildings,
  }

  return {
    world,
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
    const initial = makeState(['.....', 'I.d..', '.....'])
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
    expect(result.dwarves[0].task.target).toEqual({ x: 0, y: 1 })
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

  it('drops a dwarf onto the nearest supported cell when support is removed', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings
      .filter((building) => building.position.x !== 2)
      .concat({
        id: 'floor-2',
        type: 'bridge',
        position: { x: 2, y: 0 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      })
    state.dwarves[0] = {
      ...state.dwarves[0],
      position: { x: 2, y: 2 },
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].position).toEqual({ x: 2, y: 1 })
    expect(result.dwarves[0].movement).toBe('falling')
  })

  it('does not assign the only-support block below a dwarf as a dig', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) =>
        building.position.x !== state.dwarves[0].position.x ||
        building.position.y !== state.dwarves[0].position.y,
    )
    state.world.cells[1] = { block: 'dirt', biome: 'meadow' }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].task.kind).toBe('idle')
    expect(result.world.cells[1].block).toBe('dirt')
  })

  it('chooses safe work over a deeper unsafe target', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.cells[1] = { block: 'dirt', biome: 'meadow' }
    state.world.cells[1 * state.world.width + 2] = {
      block: 'dirt',
      biome: 'meadow',
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].task.target).toEqual({ x: 2, y: 1 })
  })

  it('does not clear a target when storage is unreachable or full', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.cells[1 * state.world.width + 2] = {
      block: 'dirt',
      biome: 'meadow',
    }
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile?.storage) throw new Error('stockpile storage missing')
    stockpile.storage = { capacity: 0, inventory: {} }

    const result = stepSimulation(state, 1)

    expect(result.world.cells[1 * result.world.width + 2].block).toBe('dirt')
    expect(result.dwarves[0].task.kind).toBe('idle')
  })

  it('keeps carried material in recovery when storage cannot accept it', () => {
    const state = makeState(['.....', '.....', '.....'])
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile?.storage) throw new Error('stockpile storage missing')
    stockpile.storage = { capacity: 0, inventory: {} }
    state.dwarves[0] = {
      ...state.dwarves[0],
      carrying: 'dirt',
      task: {
        kind: 'haul',
        target: { x: 1, y: 1 },
        path: [],
        progress: 0,
        block: 'dirt',
        buildingId: 'stockpile-1',
      },
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].carrying).toBe('dirt')
    expect(result.dwarves[0].task.purpose).toBe('recovery')
    expect(result.dwarves[0].task.recoveryReason).toBe('storage-route')
  })

  it('marks a dwarf stranded instead of assigning new mining work', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = []
    state.dwarves[0] = {
      ...state.dwarves[0],
      position: { x: 2, y: 2 },
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].movement).toBe('stranded')
    expect(result.dwarves[0].task.purpose).toBe('recovery')
    expect(result.dwarves[0].task.recoveryReason).toBe('stranded')
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

  it('assigns a builder and completes a reserved outpost order', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.cells[0] = { block: 'stone', biome: 'meadow' }
    state.inventory.stone = 12
    state.world.buildings.push({
      id: 'outpost-1',
      type: 'outpost',
      position: { x: 3, y: 1 },
      width: 2,
      height: 2,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'outpost-order',
        buildingId: 'outpost-1',
        type: 'outpost',
        required: { stone: 12 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'outpost',
      },
    ]

    const assigned = stepSimulation(state, 1)
    expect(assigned.dwarves[0].task.kind).toBe('build')
    expect(assigned.dwarves[0].carrying).toBe('stone')

    let completed = assigned
    for (let index = 0; index < 200; index += 1) {
      completed = stepSimulation(completed, 1)
      if (completed.constructionOrders.length === 0) break
    }

    expect(completed.constructionOrders).toHaveLength(0)
    expect(completed.world.buildings).toContainEqual(
      expect.objectContaining({
        id: 'outpost-1',
        construction: 'completed',
      }),
    )
  })
})

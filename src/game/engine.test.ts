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

function makeEmergencyDropState(dropDistance: number): SimulationState {
  const width = 6
  const targetY = dropDistance === 3 ? 4 : dropDistance
  const height = targetY + 2
  const cells: Cell[] = Array.from({ length: width * height }, (_, index) => {
    const y = Math.floor(index / width)
    return {
      block: y === 0 ? ('bedrock' as const) : ('air' as const),
      biome: 'meadow' as const,
    }
  })
  cells[targetY * width + 2] = { block: 'dirt', biome: 'meadow' }

  const stockpile = {
    id: 'stockpile-1',
    type: 'stockpile' as const,
    position: { x: 0, y: 1 },
    width: 1,
    height: 1,
    level: 1,
    construction: 'completed' as const,
    storage: { capacity: 120, inventory: {} },
  }

  return {
    world: {
      width,
      height,
      cells,
      seed: `engine-drop-${dropDistance}`,
      runNumber: 1,
      surfaceHeights: Array(width).fill(0),
      biomes: Array(width).fill('meadow'),
      start: { x: 1, y: 1 },
      stockpile: { x: 0, y: 1 },
      buildings: [stockpile],
    },
    dwarves: [
      {
        id: 'dwarf-1',
        position: { x: 2, y: targetY + 1 },
        movement: 'grounded',
        task: { kind: 'idle', path: [], progress: 0 },
        carrying: null,
      },
      {
        id: 'dwarf-helper',
        position: { x: 1, y: 1 },
        movement: 'grounded',
        task: { kind: 'idle', path: [], progress: 0 },
        carrying: null,
      },
    ],
    inventory: { ...EMPTY_INVENTORY, dirt: 1 },
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

  it('assigns a diagonal mining target and reaches its diagonal stand', () => {
    const state = makeState(['#####', '.....', '..d..'])
    state.world.cells = state.world.cells.map((cell, index) =>
      index < state.world.width ? { ...cell, block: 'bedrock' as const } : cell,
    )
    state.dwarves[0].position = { x: 0, y: 1 }

    const assigned = stepSimulation(state, 1)
    expect(assigned.dwarves[0].task.kind).toBe('dig')
    expect(assigned.dwarves[0].task.target).toEqual({ x: 2, y: 2 })
    expect(assigned.dwarves[0].task.path).toEqual([{ x: 1, y: 1 }])

    const moved = stepSimulation(assigned, 1)
    expect(moved.dwarves[0].position).toEqual({ x: 1, y: 1 })
    expect(moved.dwarves[0].task.kind).toBe('dig')
  })

  it('completes a diagonal dig instead of invalidating it', () => {
    const state = makeState(['#####', '.....', '..d..'])
    state.world.cells = state.world.cells.map((cell, index) =>
      index < state.world.width ? { ...cell, block: 'bedrock' as const } : cell,
    )

    const result = stepSimulation(state, 6)

    expect(result.totalCleared).toBe(1)
    expect(result.world.cells[2 * result.world.width + 2].block).toBe('air')
    expect(result.dwarves[0].carrying).toBe('dirt')
    expect(result.dwarves[0].task.kind).toBe('haul')
  })

  it('lands a dwarf after a one-cell emergency support drop', () => {
    const result = stepSimulation(makeEmergencyDropState(1), 6)

    expect(result.dwarves[0].position).toEqual({ x: 2, y: 1 })
    expect(result.dwarves[0].carrying).toBe('dirt')
    expect(result.dwarves[0].task.kind).toBe('haul')
    expect(result.totalCleared).toBe(1)
  })

  it('recovers a compact blocked support-chain save without expanding', () => {
    const state = makeEmergencyDropState(1)
    state.safety = {
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'no-safe-work',
    }
    state.constructionPolicy = 'expand'

    const result = stepSimulation(state, 20)

    expect(result.totalCleared).toBe(1)
    expect(result.safety.phase).toBe('operational')
    expect(result.constructionOrders).not.toContainEqual(
      expect.objectContaining({ type: 'outpost' }),
    )
  })

  it('does not allow a support-breaking dig to fall three cells', () => {
    const result = stepSimulation(makeEmergencyDropState(3), 20)

    expect(result.totalCleared).toBe(0)
    expect(result.dwarves[0].task.kind).toBe('idle')
  })

  it('does not count assignment alone as watchdog progress', () => {
    const result = stepSimulation(makeState(['.....', '..d..', '.....']), 1)

    expect(result.dwarves[0].task.kind).toBe('dig')
    expect(result.safety.noProgressTicks).toBe(1)
  })

  it('reports completed when every solid block is air', () => {
    const initial = makeState(['.....', '.....', '.....'])

    expect(stepSimulation(initial, 1).completed).toBe(true)
  })

  it('does not report completion while a construction plan remains', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-3',
    )
    state.world.buildings.push({
      id: 'pending-ladder',
      type: 'ladder',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'pending-ladder-order',
        buildingId: 'pending-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]

    expect(stepSimulation(state, 1).completed).toBe(false)
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

  it('uses satchel upgrades to move hauling tasks farther per tick', () => {
    const initial = makeState(['........', '........', '........'])
    const haulingDwarf = {
      ...initial.dwarves[0],
      task: {
        kind: 'haul' as const,
        target: { x: 4, y: 1 },
        path: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
          { x: 4, y: 1 },
        ],
        progress: 0,
        block: 'dirt' as const,
        buildingId: 'stockpile-1',
      },
      carrying: 'dirt' as const,
    }
    const normal = stepSimulation({ ...initial, dwarves: [haulingDwarf] }, 1)
    const upgraded = stepSimulation(
      {
        ...initial,
        dwarves: [haulingDwarf],
        upgrades: { ...initial.upgrades, satchel: 1 },
      },
      1,
    )

    expect(normal.dwarves[0].position).toEqual({ x: 2, y: 1 })
    expect(upgraded.dwarves[0].position).toEqual({ x: 3, y: 1 })
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

  it('retries emergency recovery for a grounded stranded task', () => {
    const state = makeState(['#####', '.....', '.....'])
    state.dwarves[0] = {
      ...state.dwarves[0],
      position: { x: 2, y: 1 },
      movement: 'grounded',
      task: {
        kind: 'idle',
        path: [],
        progress: 0,
        purpose: 'recovery',
        recoveryReason: 'stranded',
      },
    }
    state.inventory.dirt = 1
    state.safety = { phase: 'operational', emergencyStone: 1 }

    const result = stepSimulation(state, 1)

    expect(result.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'ladder',
        position: { x: 2, y: 2 },
        construction: 'completed',
      }),
    )
    expect(result.dwarves[0].task).toEqual(
      expect.objectContaining({
        kind: 'haul',
        purpose: 'recovery',
        recoveryReason: 'stranded',
      }),
    )
    expect(result.safety.emergencyStone).toBe(0)
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

  it('creates one deduplicated access request for unsafe valuable work', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) =>
        building.position.x !== state.dwarves[0].position.x ||
        building.position.y !== state.dwarves[0].position.y,
    )
    state.world.cells[1] = { block: 'dirt', biome: 'meadow' }

    const result = stepSimulation(state, 2)

    expect(result.accessRequests).toHaveLength(1)
    expect(result.accessRequests[0]).toEqual(
      expect.objectContaining({
        target: { x: 1, y: 0 },
        status: 'open',
      }),
    )
  })

  it('reopens a resolved access request when the target becomes unsafe again', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) =>
        building.position.x !== state.dwarves[0].position.x ||
        building.position.y !== state.dwarves[0].position.y,
    )
    state.world.cells[1] = { block: 'dirt', biome: 'meadow' }
    const created = stepSimulation(state, 1)
    expect(created.accessRequests).toHaveLength(1)
    const resolved = {
      ...created,
      dwarves: created.dwarves.map((dwarf) => ({
        ...dwarf,
        task: { kind: 'idle' as const, path: [], progress: 0 },
        carrying: null,
      })),
      accessRequests: created.accessRequests.map((request) => ({
        ...request,
        status: 'resolved' as const,
      })),
    }

    const result = stepSimulation(resolved, 1)

    expect(result.accessRequests[0]).toEqual(
      expect.objectContaining({ status: 'open' }),
    )
  })

  it('assigns a safe side dig as access work before the unsafe target', () => {
    const state = makeState(['.....', '.....', '.....'])
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile) throw new Error('stockpile missing')
    stockpile.position = { x: 0, y: 1 }
    state.world.stockpile = { x: 0, y: 1 }
    state.world.buildings = state.world.buildings.filter(
      (building) => building.type === 'stockpile' || building.position.x !== 1,
    )
    state.world.cells[1] = { block: 'dirt', biome: 'meadow' }
    state.world.cells[1 * state.world.width + 2] = {
      block: 'dirt',
      biome: 'meadow',
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].task.target).toEqual({ x: 2, y: 1 })
    expect(result.dwarves[0].task.purpose).toBe('access')
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

  it('uses carried stone to place an anchored emergency ladder before recovery', () => {
    const state = makeState(['ddddd', '..d..', '....d'])
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile) throw new Error('stockpile missing')
    state.world.buildings = [
      { ...stockpile, position: { x: 1, y: 2 }, width: 1, height: 1 },
    ]
    state.world.stockpile = { x: 1, y: 2 }
    state.dwarves[0] = {
      ...state.dwarves[0],
      position: { x: 3, y: 1 },
      carrying: 'stone',
      task: {
        kind: 'haul',
        path: [],
        progress: 0,
        block: 'stone',
        purpose: 'recovery',
        recoveryReason: 'storage-route',
      },
    }

    const result = stepSimulation(state, 1)

    expect(result.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'ladder',
        position: { x: 3, y: 2 },
        construction: 'completed',
      }),
    )
    expect(result.dwarves[0].carrying).toBeNull()
    expect(result.dwarves[0].task.kind).toBe('haul')
  })

  it('uses carried dirt to place an anchored emergency ladder before recovery', () => {
    const state = makeState(['ddddd', '..d..', '....d'])
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile) throw new Error('stockpile missing')
    state.world.buildings = [
      { ...stockpile, position: { x: 1, y: 2 }, width: 1, height: 1 },
    ]
    state.world.stockpile = { x: 1, y: 2 }
    state.dwarves[0] = {
      ...state.dwarves[0],
      position: { x: 3, y: 1 },
      carrying: 'dirt',
      task: {
        kind: 'haul',
        path: [],
        progress: 0,
        block: 'dirt',
        purpose: 'recovery',
        recoveryReason: 'storage-route',
      },
    }

    const result = stepSimulation(state, 1)

    expect(result.world.buildings).toContainEqual(
      expect.objectContaining({
        type: 'ladder',
        construction: 'completed',
      }),
    )
    expect(result.dwarves[0].carrying).toBeNull()
  })

  it('leaves bootstrap only after the starter haul loop has cleared enough work', () => {
    const state = makeState(['.....', '..d..', '.....'])
    state.safety = { phase: 'bootstrap', emergencyStone: 1 }
    state.totalCleared = 4

    expect(stepSimulation(state, 1).safety.phase).toBe('operational')
  })

  it('reports a waiting-for-stone deadlock instead of assigning unsafe work', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.safety = { phase: 'operational', emergencyStone: 0 }
    state.inventory.stone = 0
    state.accessRequests = [
      {
        id: 'access-waiting',
        target: { x: 4, y: 0 },
        failure: 'support',
        priority: 10,
        worldRevision: 0,
        status: 'open',
        blockedReason: 'waiting-for-stone',
      },
    ]
    state.world.cells = state.world.cells.map((cell) => ({
      ...cell,
      block: 'air',
    }))
    state.world.cells[1 * state.world.width + 4] = {
      block: 'air',
      biome: 'meadow',
    }
    state.world.cells[4] = { block: 'dirt', biome: 'meadow' }
    state.world.buildings = state.world.buildings.filter(
      (building) => building.type === 'stockpile' || building.position.x !== 4,
    )
    state.dwarves[0].position = { x: 4, y: 1 }

    const result = stepSimulation(state, 1)

    expect(result.safety).toEqual({
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'waiting-for-stone',
      noProgressTicks: 1,
    })
  })

  it('bounds a bootstrap deadlock instead of leaving the colony in bootstrap forever', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.dwarves = []
    state.safety = { phase: 'bootstrap', emergencyStone: 1 }
    state.world.cells[0] = { block: 'dirt', biome: 'meadow' }

    const result = stepSimulation(state, 3)

    expect(result.safety).toEqual({
      phase: 'blocked',
      emergencyStone: 1,
      blockedReason: 'no-safe-work',
      noProgressTicks: 3,
    })
  })

  it('reports a storage deadlock separately from terrain access', () => {
    const state = makeState(['.....', '.....', '.....'])
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile?.storage) throw new Error('stockpile storage missing')
    stockpile.storage = { capacity: 0, inventory: {} }
    state.world.cells[1 * state.world.width + 2] = {
      block: 'dirt',
      biome: 'meadow',
    }

    const result = stepSimulation(state, 1)

    expect(result.accessRequests).toEqual([])
    expect(result.safety).toEqual({
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'storage-full',
      noProgressTicks: 1,
    })
  })

  it('reports missing materials for a non-access construction order', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-3',
    )
    state.world.buildings.push({
      id: 'unfunded-ladder',
      type: 'ladder',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'unfunded-ladder-order',
        buildingId: 'unfunded-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]

    const result = stepSimulation(state, 1)

    expect(result.safety.blockedReason).toBe('waiting-for-material')
  })

  it('does not let a blocked state plan new expansion work', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-4' && building.id !== 'bridge-5',
    )
    state.world.cells[4] = { block: 'stone', biome: 'meadow' }
    state.world.cells[5] = { block: 'stone', biome: 'meadow' }
    state.safety = {
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'no-safe-work',
    }
    state.constructionPolicy = 'expand'
    state.inventory.stone = 12

    const result = stepSimulation(state, 1)

    expect(result.constructionOrders).toEqual([])
  })

  it('plans existing access recovery while blocked but skips new outposts', () => {
    const state = makeState(['#####', '.....', '.....', '..d..'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.type !== 'bridge' || building.position.x !== 2,
    )
    state.world.buildings.push({
      id: 'completed-ladder',
      type: 'ladder',
      position: { x: 2, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
    })
    state.inventory.dirt = 1
    state.accessRequests = [
      {
        id: 'blocked-access',
        target: { x: 2, y: 3 },
        failure: 'support',
        priority: 10,
        worldRevision: 0,
        status: 'open',
      },
    ]
    state.safety = {
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'no-safe-work',
    }
    state.constructionPolicy = 'expand'

    const result = stepSimulation(state, 1)

    expect(result.constructionOrders).toContainEqual(
      expect.objectContaining({
        type: 'ladder',
        reason: 'access',
        accessRequestId: 'blocked-access',
      }),
    )
    expect(result.constructionOrders).not.toContainEqual(
      expect.objectContaining({ type: 'outpost' }),
    )
  })

  it('allows a blocked storage-full state to plan a capacity depot', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.type !== 'bridge' || building.position.x > 1,
    )
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )
    if (!stockpile?.storage) throw new Error('fixture stockpile missing')
    stockpile.storage = { capacity: 120, inventory: { stone: 120 } }
    state.inventory.stone = 120
    state.safety = {
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'storage-full',
    }

    const result = stepSimulation(state, 1)

    expect(result.constructionOrders[0]).toEqual(
      expect.objectContaining({ type: 'depot', reason: 'capacity' }),
    )
  })

  it('skips an unreachable access order when a reachable depot can be built', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-3',
    )
    state.world.cells[1 * state.world.width + 3] = {
      block: 'bedrock',
      biome: 'meadow',
    }
    state.world.cells[0 * state.world.width + 4] = {
      block: 'bedrock',
      biome: 'meadow',
    }
    state.world.cells[2 * state.world.width + 4] = {
      block: 'bedrock',
      biome: 'meadow',
    }
    state.world.buildings.push(
      {
        id: 'unreachable-access-ladder',
        type: 'ladder',
        position: { x: 4, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'under-construction',
      },
      {
        id: 'reachable-depot',
        type: 'depot',
        position: { x: 2, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'planned',
      },
    )
    state.accessRequests = [
      {
        id: 'unreachable-access',
        target: { x: 4, y: 0 },
        failure: 'support',
        priority: 10,
        worldRevision: 0,
        status: 'open',
      },
    ]
    state.constructionOrders = [
      {
        id: 'unreachable-access-order',
        buildingId: 'unreachable-access-ladder',
        type: 'ladder',
        required: { dirt: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'access',
        accessRequestId: 'unreachable-access',
      },
      {
        id: 'reachable-depot-order',
        buildingId: 'reachable-depot',
        type: 'depot',
        required: { stone: 4 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'capacity',
      },
    ]
    state.inventory.dirt = 1
    state.inventory.stone = 4
    state.safety = {
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'storage-full',
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].task).toEqual(
      expect.objectContaining({
        kind: 'build',
        constructionOrderId: 'reachable-depot-order',
      }),
    )
  })

  it('reports an unroutable access request instead of silently idling', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.dwarves = []
    state.world.cells[0] = { block: 'dirt', biome: 'meadow' }
    state.accessRequests = [
      {
        id: 'unroutable-access',
        target: { x: 100, y: 100 },
        failure: 'support',
        priority: 10,
        worldRevision: 0,
        status: 'open',
        blockedReason: 'no-builder-route',
      },
    ]

    const result = stepSimulation(state, 1)

    expect(result.safety).toEqual({
      phase: 'blocked',
      emergencyStone: 0,
      blockedReason: 'no-safe-work',
      noProgressTicks: 1,
    })
  })

  it('cancels a stale movement path into unsupported space while preserving cargo', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-2',
    )
    state.dwarves[0] = {
      ...state.dwarves[0],
      carrying: 'dirt',
      task: {
        kind: 'haul',
        target: { x: 2, y: 1 },
        path: [{ x: 2, y: 1 }],
        progress: 0,
        block: 'dirt',
      },
    }

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].position).toEqual({ x: 1, y: 1 })
    expect(result.dwarves[0].carrying).toBe('dirt')
    expect(result.dwarves[0].task.purpose).toBe('recovery')
    expect(result.dwarves[0].task.recoveryReason).toBe('storage-route')
  })

  it('caps open access requests when several dwarves see unsafe work together', () => {
    const state = makeState(['ddddd', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.type === 'stockpile',
    )
    state.dwarves = [0, 2, 3, 4].map((x, index) => ({
      ...state.dwarves[0],
      id: `dwarf-${index + 1}`,
      position: { x, y: 1 },
    }))

    const result = stepSimulation(state, 1)

    expect(
      result.accessRequests.filter((request) => request.status === 'open'),
    ).toHaveLength(3)
  })

  it('trims a legacy pile of open access requests to the active frontier', () => {
    const state = makeState(['ddddd', '.....', '.....'])
    state.dwarves = []
    state.accessRequests = Array.from({ length: 5 }, (_, index) => ({
      id: `legacy-access-${index}`,
      target: { x: index, y: 0 },
      failure: 'storage-route' as const,
      priority: index,
      worldRevision: 0,
      status: 'open' as const,
    }))

    const result = stepSimulation(state, 1)

    expect(
      result.accessRequests.filter((request) => request.status === 'open'),
    ).toHaveLength(3)
    expect(result.accessRequests.map((request) => request.id)).toEqual([
      'legacy-access-2',
      'legacy-access-3',
      'legacy-access-4',
    ])
  })

  it('recovers construction tied to an access request trimmed from the frontier', () => {
    const state = makeState(['ddddd', '.....', '.....'])
    state.dwarves = []
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-4',
    )
    state.world.buildings.push({
      id: 'trimmed-ladder',
      type: 'ladder',
      position: { x: 4, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.accessRequests = Array.from({ length: 5 }, (_, index) => ({
      id: `trim-access-${index}`,
      target: { x: index, y: 0 },
      failure: 'storage-route' as const,
      priority: index,
      worldRevision: 0,
      status: 'open' as const,
    }))
    state.constructionOrders = [
      {
        id: 'trimmed-ladder-order',
        buildingId: 'trimmed-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: { stone: 1 },
        delivered: {},
        progress: 0,
        reason: 'access',
        accessRequestId: 'trim-access-0',
      },
    ]

    const result = stepSimulation(state, 1)
    const stockpile = result.world.buildings.find(
      (building) => building.id === 'stockpile-1',
    )

    expect(result.accessRequests.map((request) => request.id)).not.toContain(
      'trim-access-0',
    )
    expect(result.constructionOrders).toEqual([])
    expect(result.world.buildings).not.toContainEqual(
      expect.objectContaining({ id: 'trimmed-ladder' }),
    )
    expect(result.inventory.stone).toBe(1)
    expect(stockpile?.storage?.inventory.stone).toBe(1)
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
    state.world.cells[3] = { block: 'stone', biome: 'meadow' }
    state.world.cells[4] = { block: 'stone', biome: 'meadow' }
    state.inventory.stone = 12
    state.world.buildings = state.world.buildings.filter(
      (building) =>
        building.type !== 'bridge' ||
        (building.position.x !== 3 && building.position.x !== 4),
    )
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

    const assigned = stepSimulation(state, 2)
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

  it('assigns a capacity depot before an optional outpost', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings.push(
      {
        id: 'outpost-optional',
        type: 'outpost',
        position: { x: 3, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'planned',
      },
      {
        id: 'depot-capacity',
        type: 'depot',
        position: { x: 4, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'planned',
      },
    )
    state.inventory.stone = 8
    state.constructionOrders = [
      {
        id: 'outpost-optional-order',
        buildingId: 'outpost-optional',
        type: 'outpost',
        required: { stone: 4 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'outpost',
      },
      {
        id: 'depot-capacity-order',
        buildingId: 'depot-capacity',
        type: 'depot',
        required: { stone: 4 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'capacity',
      },
    ]

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].task.constructionOrderId).toBe(
      'depot-capacity-order',
    )
  })

  it('assigns common material to a ladder construction order', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.inventory.dirt = 1
    state.world.buildings.push({
      id: 'ladder-1',
      type: 'ladder',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'ladder-order',
        buildingId: 'ladder-1',
        type: 'ladder',
        required: { dirt: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]

    const result = stepSimulation(state, 1)

    expect(result.dwarves[0].carrying).toBe('dirt')
    expect(result.dwarves[0].task.kind).toBe('build')
  })

  it('keeps a multi-material order open until every material is delivered', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings = state.world.buildings.filter(
      (building) => building.id !== 'bridge-3',
    )
    state.world.buildings.push({
      id: 'multi-ladder',
      type: 'ladder',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.dwarves[0] = {
      ...state.dwarves[0],
      position: { x: 2, y: 1 },
      carrying: 'stone',
      task: {
        kind: 'build',
        target: { x: 2, y: 1 },
        path: [],
        progress: 0,
        block: 'stone',
        buildingId: 'multi-ladder',
        constructionOrderId: 'multi-order',
      },
    }
    state.constructionOrders = [
      {
        id: 'multi-order',
        buildingId: 'multi-ladder',
        type: 'ladder',
        required: { stone: 1, dirt: 1 },
        reserved: { stone: 1 },
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]

    const result = stepSimulation(state, 1)

    expect(result.constructionOrders).toHaveLength(1)
    expect(result.world.buildings).toContainEqual(
      expect.objectContaining({ id: 'multi-ladder', construction: 'planned' }),
    )
  })

  it('does not assign one reserved construction unit to multiple dwarves', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings.push({
      id: 'ladder-one-unit',
      type: 'ladder',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'ladder-one-unit-order',
        buildingId: 'ladder-one-unit',
        type: 'ladder',
        required: { stone: 1 },
        reserved: { stone: 1 },
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]
    state.dwarves = [0, 1, 2].map((index) => ({
      ...state.dwarves[0],
      id: `builder-${index}`,
    }))

    const result = stepSimulation(state, 1)

    expect(
      result.dwarves.filter((dwarf) => dwarf.task.kind === 'build'),
    ).toHaveLength(1)
    expect(
      result.dwarves.filter((dwarf) => dwarf.carrying === 'stone'),
    ).toHaveLength(1)
  })

  it('returns carried construction material when its order disappears', () => {
    const state = makeState(['.....', '.....', '.....'])
    state.world.buildings.push({
      id: 'ladder-cancelled',
      type: 'ladder',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    state.constructionOrders = [
      {
        id: 'ladder-cancelled-order',
        buildingId: 'ladder-cancelled',
        type: 'ladder',
        required: { stone: 1 },
        reserved: { stone: 1 },
        delivered: {},
        progress: 0,
        reason: 'policy',
      },
    ]

    const assigned = stepSimulation(state, 2)
    const cancelled = {
      ...assigned,
      constructionOrders: [],
    }
    const result = stepSimulation(cancelled, 1)

    expect(result.inventory.stone).toBe(1)
    expect(
      result.world.buildings.find((building) => building.id === 'stockpile-1')
        ?.storage?.inventory.stone,
    ).toBe(1)
    expect(result.dwarves[0].carrying).toBeNull()
  })
})

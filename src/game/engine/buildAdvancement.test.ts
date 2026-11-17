import { describe, expect, it } from 'vitest'
import { blockToId } from '../blocks'
import { BUILD_TICKS_PER_MATERIAL } from '../content'
import { stepSimulation } from '../engine'
import { createInitialSimulation } from '../state'
import { EMPTY_INVENTORY, type SimulationState, type World } from '../types'
import { advanceBuild } from './buildAdvancement'

function makeState(rows: string[]): SimulationState {
  const height = rows.length
  const width = rows[0].length
  const cells: number[] = rows.flatMap((row) =>
    [...row].map((value) => blockToId(value === '.' ? 'air' : 'dirt')),
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
    cells: Uint8Array.from(cells),
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
        position: { x: 2, y: 1 },
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

/** A state with one site being worked, at the site, carrying `stone`. */
function makeBuildingState(options: {
  construction?: 'planned' | 'completed'
  reason?: 'policy' | 'storage-upgrade'
  buildingId?: string
  withStorage?: boolean
}): SimulationState {
  const buildingId = options.buildingId ?? 'ladder-1'
  const state = makeState(['.....', '.....', '.....'])
  state.world.buildings = state.world.buildings.filter(
    ({ id }) => id !== 'bridge-2',
  )
  state.world.buildings.push({
    id: buildingId,
    type: 'ladder',
    position: { x: 2, y: 1 },
    width: 1,
    height: 1,
    level: 1,
    construction: options.construction ?? 'planned',
    ...(options.withStorage
      ? { storage: { capacity: 24, inventory: {} } }
      : {}),
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
      buildingId,
      constructionOrderId: `${buildingId}-order`,
    },
  }
  state.constructionOrders = [
    {
      id: `${buildingId}-order`,
      buildingId,
      type: 'ladder',
      required: { stone: 1 },
      reserved: { stone: 1 },
      delivered: {},
      progress: 0,
      reason: options.reason ?? 'policy',
      ...(options.reason === 'storage-upgrade' ? { targetLevel: 2 } : {}),
    },
  ]
  return state
}

function deliver(state: SimulationState, ticks: number): SimulationState {
  let current = state
  for (let tick = 0; tick < ticks; tick += 1) {
    const result = advanceBuild(current, current.dwarves[0])
    current = {
      ...current,
      world: result.world,
      dwarves: [result.dwarf],
      ...(result.constructionOrders
        ? { constructionOrders: result.constructionOrders }
        : {}),
    }
  }
  return current
}

describe('build advancement', () => {
  it('spends BUILD_TICKS_PER_MATERIAL ticks on site before delivering', () => {
    const state = makeBuildingState({})
    const working = deliver(state, BUILD_TICKS_PER_MATERIAL - 1)

    expect(working.constructionOrders[0].delivered.stone).toBeUndefined()
    expect(working.dwarves[0].carrying).toBe('stone')
    expect(working.dwarves[0].task.progress).toBe(BUILD_TICKS_PER_MATERIAL - 1)

    const done = deliver(working, 1)

    expect(done.constructionOrders).toHaveLength(0)
    expect(done.dwarves[0].carrying).toBeNull()
    expect(done.world.buildings.find(({ id }) => id === 'ladder-1')).toEqual(
      expect.objectContaining({ construction: 'completed' }),
    )
  })

  it('flips a planned site to under-construction once work starts', () => {
    const state = makeBuildingState({})
    const started = deliver(state, 1)

    expect(started.world.buildings.find(({ id }) => id === 'ladder-1')).toEqual(
      expect.objectContaining({ construction: 'under-construction' }),
    )
  })

  it('does not mark a completed building as under-construction during a storage upgrade', () => {
    const state = makeBuildingState({
      construction: 'completed',
      reason: 'storage-upgrade',
      withStorage: true,
    })
    const started = deliver(state, 1)

    expect(started.world.buildings.find(({ id }) => id === 'ladder-1')).toEqual(
      expect.objectContaining({ construction: 'completed' }),
    )
  })

  it('shows a site under construction during a real run', () => {
    let state = createInitialSimulation('a1')
    let firstTick = -1

    for (let tick = 0; tick < 2000 && firstTick === -1; tick += 1) {
      state = stepSimulation(state)
      const started = state.world.buildings.some(
        ({ construction }) => construction === 'under-construction',
      )
      if (started) firstTick = state.tick
    }

    expect(firstTick).toBeGreaterThan(0)
  })
})

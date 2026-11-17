import { describe, expect, it } from 'vitest'
import { blockToId } from '../blocks'
import { BUILD_TICKS_PER_MATERIAL, DIG_DURATION } from '../content'
import {
  type DwarfState,
  EMPTY_INVENTORY,
  type SimulationState,
} from '../types'
import { advanceAnchorBuild } from './anchorAdvancement'
import { advanceDig } from './digAdvancement'

/**
 * A one-wide shaft: the dwarf stands on a dirt block it is about to dig out,
 * the landing one cell below is floored by stone, and the walls are solid, so
 * the only way back to the stockpile above is a ladder.
 */
function makeShaftState(): SimulationState {
  const width = 3
  const height = 6
  const cells = new Array(width * height).fill(blockToId('stone'))
  const set = (x: number, y: number, value: 'air' | 'dirt') => {
    cells[y * width + x] = blockToId(value)
  }
  set(1, 2, 'dirt')
  for (const y of [3, 4, 5]) set(1, y, 'air')

  const stockpile = {
    id: 'stockpile-1',
    type: 'stockpile' as const,
    position: { x: 1, y: 4 },
    width: 1,
    height: 1,
    level: 1,
    construction: 'completed' as const,
    storage: { capacity: 120, inventory: { stone: 1 } },
  }

  return {
    world: {
      width,
      height,
      cells: Uint8Array.from(cells),
      seed: 'anchor-fixture',
      runNumber: 1,
      surfaceHeights: Array(width).fill(0),
      biomes: Array(width).fill('meadow'),
      start: { x: 1, y: 4 },
      stockpile: { x: 1, y: 4 },
      buildings: [stockpile],
    },
    dwarves: [diggingDwarf()],
    inventory: { ...EMPTY_INVENTORY, stone: 1 },
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

function diggingDwarf(): DwarfState {
  return {
    id: 'dwarf-1',
    position: { x: 1, y: 3 },
    movement: 'grounded',
    task: {
      kind: 'dig',
      target: { x: 1, y: 2 },
      path: [],
      progress: DIG_DURATION.dirt - 1,
    },
    carrying: null,
  }
}

function ladders(state: SimulationState) {
  return state.world.buildings.filter(({ type }) => type === 'ladder')
}

/** Runs the anchor task for `ticks` ticks, folding each result back in. */
function anchor(state: SimulationState, ticks: number): SimulationState {
  let current = state
  for (let tick = 0; tick < ticks; tick += 1) {
    const result = advanceAnchorBuild(current, current.dwarves[0])
    current = {
      ...current,
      world: result.world,
      dwarves: [result.dwarf],
      ...(result.inventory ? { inventory: result.inventory } : {}),
    }
  }
  return current
}

describe('anchoring the return ladder', () => {
  it('mines the drop first and anchors the ladder afterwards', () => {
    const state = makeShaftState()
    const result = advanceDig(state, state.dwarves[0])

    expect(result.minedBlock).toBe('dirt')
    expect(result.dwarf.position).toEqual({ x: 1, y: 2 })
    expect(result.dwarf.carrying).toBe('dirt')
    expect(result.dwarf.task.kind).toBe('anchor')
    expect(result.dwarf.task.block).toBe('stone')
    expect(ladders({ ...state, world: result.world })).toEqual([])
    // The stone is not spent until the ladder is actually anchored.
    expect(result.inventory).toBeUndefined()
  })

  it('places the ladder and charges the stone after the build ticks', () => {
    const state = makeShaftState()
    const dug = advanceDig(state, state.dwarves[0])
    const mined: SimulationState = {
      ...state,
      world: dug.world,
      dwarves: [dug.dwarf],
    }

    const working = anchor(mined, BUILD_TICKS_PER_MATERIAL - 1)
    expect(ladders(working)).toEqual([])
    expect(working.inventory.stone).toBe(1)
    expect(working.dwarves[0].task.kind).toBe('anchor')

    const anchored = anchor(working, 1)
    expect(ladders(anchored)).toHaveLength(1)
    expect(ladders(anchored)[0]).toEqual(
      expect.objectContaining({
        position: { x: 1, y: 3 },
        construction: 'completed',
      }),
    )
    expect(anchored.inventory.stone).toBe(0)
    expect(anchored.dwarves[0].task.kind).toBe('haul')
    expect(anchored.dwarves[0].carrying).toBe('dirt')
  })

  it('charges nothing and falls back when the material is gone', () => {
    const state = makeShaftState()
    const dug = advanceDig(state, state.dwarves[0])
    const mined: SimulationState = {
      ...state,
      world: dug.world,
      dwarves: [dug.dwarf],
      inventory: { ...state.inventory, stone: 0 },
    }
    const stripped: SimulationState = {
      ...mined,
      world: {
        ...mined.world,
        buildings: mined.world.buildings.map((building) =>
          building.storage
            ? { ...building, storage: { ...building.storage, inventory: {} } }
            : building,
        ),
      },
    }

    const result = anchor(stripped, BUILD_TICKS_PER_MATERIAL)

    expect(ladders(result)).toEqual([])
    expect(result.inventory.stone).toBe(0)
    expect(result.dwarves[0].task.kind).not.toBe('anchor')
  })
})

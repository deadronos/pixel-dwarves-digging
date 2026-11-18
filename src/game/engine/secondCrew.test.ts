import { describe, expect, it } from 'vitest'
import { blockToId } from '../blocks'
import { createInitialSimulation } from '../state'
import type { DwarfState, SimulationState } from '../types'
import { advanceIdle } from './idleAdvancement'

function makeCrewState(storageX = 7): SimulationState {
  const state = createInitialSimulation('second-crew')
  const position = { x: storageX, y: 1 }
  const width = 12
  const dwarf = state.dwarves[0]
  const miner = (x: number): DwarfState => ({
    ...dwarf,
    id: `miner-${x}`,
    position: { x, y: 1 },
    task: {
      kind: 'dig',
      target: { x, y: 2 },
      path: [],
      progress: 1,
      purpose: 'ordinary',
    },
  })
  return {
    ...state,
    secondCrew: true,
    world: {
      ...state.world,
      width,
      height: 3,
      topologyKey: {},
      cells: Uint8Array.from(
        ['############', '............', '...###.....#'].join(''),
        (cell, index) =>
          blockToId(cell === '.' ? 'air' : index < width ? 'bedrock' : 'dirt'),
      ),
      surfaceHeights: Array(width).fill(1),
      biomes: Array(width).fill('meadow'),
      start: position,
      stockpile: position,
      buildings: [
        {
          ...state.world.buildings[0],
          position,
          width: 1,
          height: 1,
        },
      ],
    },
    policy: { ...state.policy, workPreference: 'nearest' },
    safety: { ...state.safety, phase: 'operational' },
    dwarves: [{ ...dwarf, position: { x: 5, y: 1 } }, miner(3), miner(4)],
  }
}

function assign(state: SimulationState) {
  return advanceIdle(state, state.dwarves[0]).dwarf.task
}

describe('second mining crew', () => {
  it('sends an empty miner to an alternate when two coworkers staff the main face', () => {
    const state = makeCrewState()

    expect(assign({ ...state, secondCrew: false }).target).toEqual({
      x: 5,
      y: 2,
    })
    expect(assign(state)).toMatchObject({
      kind: 'dig',
      target: { x: 11, y: 2 },
      purpose: 'ordinary',
    })
  })

  it('keeps staffing the best local work before two coworkers are assigned', () => {
    const state = makeCrewState()
    expect(
      assign({ ...state, dwarves: state.dwarves.slice(0, 2) }).target,
    ).toEqual({
      x: 5,
      y: 2,
    })
  })

  it('stays on the main face when a reachable alternate has a longer haul', () => {
    const state = makeCrewState(0)
    expect(assign(state).target).toEqual({ x: 5, y: 2 })
  })

  it('stays on the main face when the alternate is already assigned', () => {
    const state = makeCrewState()
    const coworker = state.dwarves[1]
    const claimed: DwarfState = {
      ...coworker,
      id: 'alternate-miner',
      position: { x: 11, y: 1 },
      task: { ...coworker.task, target: { x: 11, y: 2 } },
    }
    expect(
      assign({ ...state, dwarves: [...state.dwarves, claimed] }).target,
    ).toEqual({
      x: 5,
      y: 2,
    })
  })

  it('keeps a loaded satchel on its regular same-material assignment', () => {
    const state = makeCrewState()
    const loaded: DwarfState = { ...state.dwarves[0], carrying: 'dirt' }
    expect(
      assign({
        ...state,
        dwarves: [loaded, ...state.dwarves.slice(1)],
        upgrades: { ...state.upgrades, satchel: 1 },
      }).target,
    ).toEqual({ x: 5, y: 2 })
  })
})

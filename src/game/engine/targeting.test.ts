import { describe, expect, it } from 'vitest'
import { addMaterialToStorage, removeFromStorage } from '../buildings/storage'
import { clearCell } from '../generation'
import { appendPlannedConstruction } from '../logistics/expansionPlanning'
import { createInitialSimulation } from '../state'
import {
  createTargetPlanningContext,
  getTargetPlanningSnapshot,
  rankedWorkCandidates,
  reachableTargets,
  taskKey,
} from './targeting'

describe('targeting helpers', () => {
  it('shares one enriched and ranked snapshot across target consumers', () => {
    const state = createInitialSimulation('targeting-context-reuse')
    const dwarf = state.dwarves[0]
    const context = createTargetPlanningContext(state)

    const first = getTargetPlanningSnapshot(context, state, dwarf)
    const second = getTargetPlanningSnapshot(context, state, dwarf)

    expect(second).toBe(first)
    expect(second.reachableCandidates).toBe(first.reachableCandidates)
    expect(second.rankedWorkCandidates).toBe(first.rankedWorkCandidates)
    expect(second.rankedWorkCandidates).toEqual(
      expect.arrayContaining(second.reachableCandidates),
    )
    expect(
      second.rankedWorkCandidates.every(
        (candidate, index) =>
          index === 0 ||
          second.rankedWorkCandidates[index - 1].score >= candidate.score,
      ),
    ).toBe(true)
  })

  it('invalidates the shared snapshot when topology changes during a tick', () => {
    const state = createInitialSimulation('targeting-context-invalidation')
    const dwarf = state.dwarves[0]
    const context = createTargetPlanningContext(state)
    const initial = getTargetPlanningSnapshot(context, state, dwarf)
    const target = initial.reachableCandidates[0]?.target
    if (!target) throw new Error('targeting fixture has no exposed work')

    const nextState = { ...state, world: clearCell(state.world, target) }
    const next = getTargetPlanningSnapshot(context, nextState, dwarf)

    expect(next).not.toBe(initial)
    expect(
      next.reachableCandidates.some(
        (candidate) => taskKey(candidate.target) === taskKey(target),
      ),
    ).toBe(false)
  })

  it('preserves the shared snapshot when planned construction keeps the topology', () => {
    const state = createInitialSimulation('targeting-context-planned-building')
    const dwarf = state.dwarves[0]
    const context = createTargetPlanningContext(state)
    const initial = getTargetPlanningSnapshot(context, state, dwarf)

    const plannedState = appendPlannedConstruction(
      state,
      'outpost',
      state.world.start,
    )
    const planned = getTargetPlanningSnapshot(context, plannedState, dwarf)

    expect(plannedState.world).not.toBe(state.world)
    expect(plannedState.world.topologyKey).toBe(state.world.topologyKey)
    expect(planned).toBe(initial)
  })

  it('ranks reachable work once while excluding reserved targets', () => {
    const state = createInitialSimulation('targeting-helper')
    state.safety.phase = 'operational'
    const dwarf = state.dwarves[0]
    const reachable = reachableTargets(state.world, dwarf.position)
    const reservedTarget = reachable[0]?.target
    if (!reservedTarget)
      throw new Error('targeting fixture has no exposed work')

    state.dwarves[1] = {
      ...state.dwarves[1],
      task: {
        kind: 'dig',
        target: reservedTarget,
        path: [],
        progress: 0,
      },
    }

    const candidates = rankedWorkCandidates(state, dwarf)

    expect(
      candidates.some(
        ({ target }) => taskKey(target) === taskKey(reservedTarget),
      ),
    ).toBe(false)
    expect(
      candidates.every(
        (candidate, index) =>
          index === 0 || candidates[index - 1].score >= candidate.score,
      ),
    ).toBe(true)
  })

  it('reuses reachable targets cache across storage additions and removals', () => {
    const state = createInitialSimulation('targeting-cache-reuse')
    state.safety.phase = 'operational'
    const dwarf = state.dwarves[0]
    const initial = reachableTargets(state.world, dwarf.position)

    const updatedWorld = addMaterialToStorage(
      state.world,
      'stockpile-1',
      'stone',
    )
    if (!updatedWorld) throw new Error('Failed to add material')
    expect(updatedWorld).not.toBe(state.world)

    const afterAdd = reachableTargets(updatedWorld, dwarf.position)
    expect(afterAdd).toBe(initial)

    const afterRemoveWorld = removeFromStorage(updatedWorld, 'stone', 1)
    expect(afterRemoveWorld).not.toBe(updatedWorld)

    const afterRemove = reachableTargets(afterRemoveWorld, dwarf.position)
    expect(afterRemove).toBe(initial)
  })

  it('invalidates reachable targets cache when terrain is altered with clearCell', () => {
    const state = createInitialSimulation('targeting-cache-invalidation')
    state.safety.phase = 'operational'
    const dwarf = state.dwarves[0]
    const initial = reachableTargets(state.world, dwarf.position)
    const target = initial[0]?.target
    if (!target) throw new Error('targeting fixture has no exposed work')

    const clearedWorld = clearCell(state.world, target)
    expect(clearedWorld).not.toBe(state.world)

    const afterDig = reachableTargets(clearedWorld, dwarf.position)
    expect(afterDig).not.toBe(initial)
  })
})

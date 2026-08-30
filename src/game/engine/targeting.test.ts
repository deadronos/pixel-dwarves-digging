import { describe, expect, it } from 'vitest'
import { addMaterialToStorage, removeFromStorage } from '../buildings/storage'
import { clearCell } from '../generation'
import { createInitialSimulation } from '../state'
import { rankedWorkCandidates, reachableTargets, taskKey } from './targeting'

describe('targeting helpers', () => {
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

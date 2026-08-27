import { describe, expect, it } from 'vitest'
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
})

import { describe, expect, it } from 'vitest'
import { createInitialSimulation } from '../../state'
import { isSimulationState } from './state'

describe('simulation state validation', () => {
  it('accepts a fresh state and rejects duplicate dwarf ids', () => {
    const state = createInitialSimulation('state-validation')

    expect(isSimulationState(state)).toBe(true)
    expect(
      isSimulationState({
        ...state,
        dwarves: [...state.dwarves, state.dwarves[0]],
      }),
    ).toBe(false)
  })
})

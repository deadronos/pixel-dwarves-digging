import { describe, expect, it } from 'vitest'
import { createInitialSimulation } from '../state'
import { advanceDwarf } from './advancement'

describe('dwarf advancement dispatcher', () => {
  it('preserves a falling dwarf until settlement handles it', () => {
    const state = createInitialSimulation('advancement-dispatcher')
    const dwarf = { ...state.dwarves[0], movement: 'falling' as const }

    const result = advanceDwarf(state, dwarf)

    expect(result.dwarf).toEqual(dwarf)
    expect(result.world).toBe(state.world)
    expect(result.minedBlock).toBeNull()
  })
})

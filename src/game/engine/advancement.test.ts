import { describe, expect, it } from 'vitest'
import { createInitialSimulation } from '../state'
import { advanceDwarf } from './advancement'
import { advanceBuild } from './buildAdvancement'
import { advanceDig } from './digAdvancement'
import { advanceHaul } from './haulAdvancement'

describe('dwarf advancement dispatcher', () => {
  it('preserves a falling dwarf until settlement handles it', () => {
    const state = createInitialSimulation('advancement-dispatcher')
    const dwarf = { ...state.dwarves[0], movement: 'falling' as const }

    const result = advanceDwarf(state, dwarf)

    expect(result.dwarf).toEqual(dwarf)
    expect(result.world).toBe(state.world)
    expect(result.minedBlock).toBeNull()
  })

  it('keeps task handlers safe when called with another task kind', () => {
    const state = createInitialSimulation('advancement-handler-guards')
    const dwarf = state.dwarves[0]

    expect(advanceBuild(state, dwarf).dwarf.task.kind).toBe('idle')
    expect(advanceDig(state, dwarf).dwarf.task.kind).toBe('idle')
    expect(advanceHaul(state, dwarf).dwarf.task.kind).toBe('idle')
  })
})

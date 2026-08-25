import { describe, expect, it } from 'vitest'
import { createInitialSimulation } from '../state'
import { deriveSafetyObservation } from './safetyObservation'

describe('safety observation', () => {
  it('derives active work and terrain facts from simulation state', () => {
    const state = createInitialSimulation('safety-observation-test')
    const observation = deriveSafetyObservation(state)

    expect(observation.hasActiveWork).toBe(false)
    expect(observation.hasMineableSolids).toBe(true)
    expect(observation.hasRecovery).toBe(false)
  })
})

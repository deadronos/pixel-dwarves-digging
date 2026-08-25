import { describe, expect, it } from 'vitest'
import { createInitialSimulation } from '../state'
import { getExpansionEligibility } from './expansionEligibility'

describe('expansion eligibility', () => {
  it('derives shared material and pending-order facts', () => {
    const state = createInitialSimulation('eligibility-test')
    const eligibility = getExpansionEligibility(state)

    expect(eligibility.availableStone).toBeGreaterThan(0)
    expect(eligibility.hasPendingCapacityOrder).toBe(false)
    expect(eligibility.hasPendingOutpostOrder).toBe(false)
  })
})

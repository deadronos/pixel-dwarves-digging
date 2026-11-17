import { describe, expect, it } from 'vitest'
import { stepSimulation } from './engine'
import { createInitialSimulation } from './state'

/**
 * Pacing guard from #77.
 *
 * Travel dominates the colony tick budget, so these floors are deliberately
 * loose: they catch a real throughput regression, not balance tuning. Sample
 * baselines at 1,000 ticks: a1 = 186 blocks, b2 = 217 blocks.
 */
describe('early-run pacing', () => {
  const cases = [
    { seed: 'a1', floor: 170 },
    { seed: 'b2', floor: 195 },
  ]

  for (const { seed, floor } of cases) {
    it(`clears at least ${floor} blocks in 1,000 ticks on seed ${seed}`, () => {
      const state = stepSimulation(createInitialSimulation(seed), 1000)

      expect(state.totalCleared).toBeGreaterThanOrEqual(floor)
    })
  }
})

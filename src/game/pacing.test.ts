import { describe, expect, it } from 'vitest'
import { stepSimulation } from './engine'
import { createInitialSimulation } from './state'

// These floors catch major throughput regressions while allowing balance tuning.
describe('excavation pacing', () => {
  it('clears at least 170 blocks in the first 1,000 ticks on seed a1', () => {
    const state = stepSimulation(createInitialSimulation('a1'), 1000)

    expect(state.totalCleared).toBeGreaterThanOrEqual(170)
  })

  it('keeps the b2 frontier productive after the opening 1,000 ticks', () => {
    const opening = stepSimulation(createInitialSimulation('b2'), 1000)
    expect(opening.totalCleared).toBeGreaterThanOrEqual(195)

    let state = opening
    let blockedStreak = 0
    let longestBlockedStreak = 0
    for (let tick = 1000; tick < 3000; tick += 1) {
      state = stepSimulation(state)
      blockedStreak = state.safety.phase === 'blocked' ? blockedStreak + 1 : 0
      longestBlockedStreak = Math.max(longestBlockedStreak, blockedStreak)
    }

    expect(state.totalCleared - opening.totalCleared).toBeGreaterThanOrEqual(
      120,
    )
    expect(longestBlockedStreak).toBeLessThan(200)
  }, 90_000)
})

import { describe, expect, it } from 'vitest'
import { createInitialSimulation } from '../state'
import {
  appendPlannedConstruction,
  outpostCandidatePositions,
} from './expansionPlanning'

describe('expansion planning helpers', () => {
  it('generates outpost candidates from the world start position', () => {
    const state = createInitialSimulation('expansion-planning-candidates')
    const candidates = outpostCandidatePositions(state)

    expect(candidates[0]).toEqual({
      x: state.world.start.x + 3,
      y: state.world.start.y,
    })
    expect(candidates.every(({ y }) => y === state.world.start.y)).toBe(true)
  })

  it('appends a planned building and matching order without mutating input', () => {
    const state = createInitialSimulation('expansion-planning-append')
    const position = outpostCandidatePositions(state)[0]
    const initialBuildingCount = state.world.buildings.length
    const planned = appendPlannedConstruction(state, 'outpost', position)

    expect(state.world.buildings).toHaveLength(initialBuildingCount)
    expect(planned.world.buildings).toHaveLength(initialBuildingCount + 1)
    expect(planned.constructionOrders.at(-1)).toMatchObject({
      buildingId: `outpost-${initialBuildingCount + 1}`,
      reason: 'outpost',
      type: 'outpost',
    })
  })
})

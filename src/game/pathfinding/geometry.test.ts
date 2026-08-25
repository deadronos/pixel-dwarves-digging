import { describe, expect, it } from 'vitest'
import { isClearedPosition, isInBounds } from './geometry'

describe('pathfinding geometry helpers', () => {
  it('checks positions against world bounds', () => {
    const world = { width: 3, height: 2 }
    expect(isInBounds(world, { x: 2, y: 1 })).toBe(true)
    expect(isInBounds(world, { x: 3, y: 1 })).toBe(false)
  })

  it('matches only the virtual cleared position', () => {
    expect(isClearedPosition({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
    expect(isClearedPosition({ x: 1, y: 2 }, { x: 2, y: 2 })).toBe(false)
  })
})

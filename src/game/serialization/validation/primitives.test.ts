import { describe, expect, it } from 'vitest'
import { isInventoryRecord, isPosition } from './primitives'

describe('save validation primitives', () => {
  it('validates bounded positions and partial inventories', () => {
    expect(isPosition({ x: 1, y: 2 }, 3, 4)).toBe(true)
    expect(isPosition({ x: 3, y: 2 }, 3, 4)).toBe(false)
    expect(isInventoryRecord({ stone: 2 }, true)).toBe(true)
    expect(isInventoryRecord({ stone: -1 }, true)).toBe(false)
  })
})

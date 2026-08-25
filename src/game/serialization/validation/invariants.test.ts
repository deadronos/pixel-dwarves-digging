import { describe, expect, it } from 'vitest'
import { hasUniqueIds } from './invariants'

describe('serialization invariants', () => {
  it('detects duplicate record ids', () => {
    expect(hasUniqueIds([{ id: 'a' }, { id: 'b' }])).toBe(true)
    expect(hasUniqueIds([{ id: 'a' }, { id: 'a' }])).toBe(false)
  })
})

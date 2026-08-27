import { describe, expect, it } from 'vitest'
import { idleTask } from './tasks'

describe('engine task constructors', () => {
  it('creates a fresh empty idle task', () => {
    const first = idleTask()
    const second = idleTask()

    expect(first).toEqual({ kind: 'idle', path: [], progress: 0 })
    expect(second).not.toBe(first)
  })
})

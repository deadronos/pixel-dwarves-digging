import { describe, expect, it } from 'vitest'
import { getStorageDiagnostics } from './logistics'
import { createInitialSimulation } from './state'

describe('storage diagnostics performance', () => {
  it('benchmarks repeated storage diagnostics across ticking simulation', () => {
    const baseSimulation = createInitialSimulation('storage-perf-seed')
    const iterations = 1000

    const started = performance.now()
    let diagnosticCount = 0
    let initialExpansion:
      | ReturnType<typeof getStorageDiagnostics>['expansion']
      | undefined

    for (let index = 0; index < iterations; index += 1) {
      // Simulate state updates where tick increments without changing underlying structure
      const current = {
        ...baseSimulation,
        tick: index,
      }
      const diagnostics = getStorageDiagnostics(current)
      if (initialExpansion === undefined) {
        initialExpansion = diagnostics.expansion
      } else {
        expect(diagnostics.expansion).toBe(initialExpansion)
      }
      diagnosticCount += 1
    }

    const elapsed = performance.now() - started
    console.info(
      JSON.stringify({
        benchmark: 'storage-diagnostics-repeated-calls',
        iterations: diagnosticCount,
        elapsedMs: Number(elapsed.toFixed(2)),
        avgMsPerCall: Number((elapsed / diagnosticCount).toFixed(4)),
      }),
    )

    expect(diagnosticCount).toBe(iterations)
    expect(initialExpansion).toBeDefined()
    expect(initialExpansion?.length).toBeGreaterThan(0)
  })
})

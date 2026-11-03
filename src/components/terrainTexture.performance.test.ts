import { describe, expect, it } from 'vitest'
import { generateWorld } from '../game/generation'
import { fillTerrainTexels, terrainBufferLength } from './terrainTexture'

// Deliberately coarse so slower CI hardware does not make this benchmark
// flaky: the real cost is under a millisecond per refill, and a refill only
// happens when the cells change (one per mining tick, not per frame).
const REFILL_BUDGET_MS = 500
const REFILLS = 20

describe('terrain texture refill performance', () => {
  it('refills a whole world-sized texture well inside a tick', () => {
    const world = generateWorld('terrain-texture-perf', 1, 0)
    const out = new Uint8Array(terrainBufferLength(world.width, world.height))

    // Warm up so the first fill does not pay for JIT compilation.
    fillTerrainTexels(world, out)

    const started = performance.now()
    for (let index = 0; index < REFILLS; index += 1) {
      // Every refill writes the whole buffer, like a tick that mined a cell.
      fillTerrainTexels(world, out)
    }
    const elapsed = performance.now() - started

    console.info(
      JSON.stringify({
        benchmark: 'terrain-texture-refill',
        refills: REFILLS,
        elapsedMs: Number(elapsed.toFixed(2)),
        avgMsPerRefill: Number((elapsed / REFILLS).toFixed(4)),
      }),
    )

    expect(elapsed).toBeLessThan(REFILL_BUDGET_MS)
    expect(out.length).toBe(terrainBufferLength(world.width, world.height))
  })
})

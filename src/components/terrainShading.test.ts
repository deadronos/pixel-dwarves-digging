import { describe, expect, it } from 'vitest'
import { BLOCK_COLORS } from '../game/content'
import { parseHexColor } from './colorMath'
import {
  DEPTH_DARKEN,
  DEPTH_SATURATION_CELLS,
  depthFactorFor,
  EDGE_BOTTOM_DARKEN,
  EDGE_SIDE_LIGHTEN,
  EDGE_TOP_LIGHTEN,
  edgeLit,
  edgeShadowed,
  SKY_FAR_COLOR,
  SKY_NEAR_COLOR,
  shadeForDepth,
  skyColorFor,
  TERRAIN_TEXELS_PER_CELL,
  TUNNEL_DARKEN,
  tunnelAirFor,
} from './terrainShading'

function luma(rgb: readonly number[]): number {
  return rgb[0] + rgb[1] + rgb[2]
}

describe('depth shading', () => {
  it('leaves the surface unshaded', () => {
    expect(depthFactorFor(0)).toBe(1)
    expect(depthFactorFor(-5)).toBe(1)
  })

  it('darkens monotonically and then saturates', () => {
    let previous = depthFactorFor(0)
    for (let depth = 1; depth <= DEPTH_SATURATION_CELLS; depth += 1) {
      const factor = depthFactorFor(depth)
      expect(factor).toBeLessThanOrEqual(previous)
      previous = factor
    }
    expect(depthFactorFor(DEPTH_SATURATION_CELLS)).toBeCloseTo(1 - DEPTH_DARKEN)
    expect(depthFactorFor(DEPTH_SATURATION_CELLS * 4)).toBeCloseTo(
      1 - DEPTH_DARKEN,
    )
  })

  it('keeps the same shade step for every block at the same depth', () => {
    for (const hex of Object.values(BLOCK_COLORS)) {
      const base = parseHexColor(hex)
      const shallow = shadeForDepth(base, 0)
      const deep = shadeForDepth(base, DEPTH_SATURATION_CELLS)
      const shallowRatio = luma(deep) / Math.max(1, luma(shallow))
      expect(shallowRatio).toBeCloseTo(1 - DEPTH_DARKEN, 1)
    }
  })

  it('stays inside the byte range', () => {
    for (const channel of shadeForDepth([255, 255, 255], 20)) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
  })
})

describe('sky and tunnel air', () => {
  it('runs from the near colour at the surface to the far colour on top', () => {
    expect(skyColorFor(0, 30)).toEqual(SKY_NEAR_COLOR)
    expect(skyColorFor(30, 30)).toEqual(SKY_FAR_COLOR)
    expect(skyColorFor(60, 30)).toEqual(SKY_FAR_COLOR)
  })

  it('darkens the sky as it rises', () => {
    expect(luma(skyColorFor(20, 30))).toBeLessThan(luma(skyColorFor(5, 30)))
  })

  it('keeps tunnel air darker than open sky', () => {
    const air = parseHexColor(BLOCK_COLORS.air)
    const tunnel = tunnelAirFor(air, 20)
    expect(luma(tunnel)).toBeLessThan(luma(air))
    expect(luma(tunnel)).toBeLessThan(luma(skyColorFor(0, 30)) + 1)
    // A deep pocket is darker than a shallow one.
    expect(luma(tunnelAirFor(air, 30))).toBeLessThan(luma(tunnel))
    expect(TUNNEL_DARKEN).toBeGreaterThan(0)
  })
})

describe('edge lighting', () => {
  it('lights the top edge more than the sides', () => {
    const base = parseHexColor(BLOCK_COLORS.dirt)
    const top = edgeLit(base, 'top')
    const side = edgeLit(base, 'side')
    expect(luma(top)).toBeGreaterThan(luma(side))
    expect(luma(side)).toBeGreaterThan(luma(base))
    expect(EDGE_TOP_LIGHTEN).toBeGreaterThan(EDGE_SIDE_LIGHTEN)
  })

  it('shadows an air-facing underside', () => {
    const base = parseHexColor(BLOCK_COLORS.dirt)
    expect(luma(edgeShadowed(base))).toBeLessThan(luma(base))
    expect(EDGE_BOTTOM_DARKEN).toBeGreaterThan(0)
  })

  it('keeps an edge accent subtle enough to still read as the same block', () => {
    // Accents are a fixed sRGB mix, so they move a near-black block (bedrock)
    // further in absolute terms than a pale one. The bound is what keeps the
    // rim an accent instead of a second colour: see `palette.test.ts`, which
    // checks the shaded extremes against the whole palette.
    for (const [name, hex] of Object.entries(BLOCK_COLORS)) {
      if (name === 'air') continue
      const base = parseHexColor(hex)
      for (const accent of [edgeLit(base, 'top'), edgeShadowed(base)]) {
        const delta =
          Math.abs(accent[0] - base[0]) +
          Math.abs(accent[1] - base[1]) +
          Math.abs(accent[2] - base[2])
        expect(delta, `accent on ${name}`).toBeLessThan(110)
        expect(delta, `accent on ${name}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('supersampling', () => {
  it('uses a small odd number of texels per cell so cells stay centred', () => {
    expect(TERRAIN_TEXELS_PER_CELL % 2).toBe(1)
    expect(TERRAIN_TEXELS_PER_CELL).toBeGreaterThanOrEqual(3)
  })
})

import { describe, expect, it } from 'vitest'
import { BLOCK_ID_LIST } from './blocks'
import {
  BLOCK_COLORS,
  BUILDING_COLORS,
  BUILDING_DEFINITIONS,
  MINERAL_BLOCKS,
} from './content'
import type { BlockType, BuildingType } from './types'

type Oklab = [number, number, number]

function srgbToLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * OKLab, via the reference sRGB -> linear -> LMS' path. OKLab is used because
 * it is close to perceptually uniform: equal distances look like equal
 * differences, which plain RGB hex distances do not.
 */
function hexToOklab(hex: string): Oklab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as Oklab
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Perceptual distance in OKLab. 1.0 is a full black-to-white step. */
function distance(hexA: string, hexB: string): number {
  const a = hexToOklab(hexA)
  const b = hexToOklab(hexB)
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * Minimum perceptual distance allowed between any two palette colours.
 *
 * A just-noticeable OKLab difference for large, calm patches is about 0.02.
 * Terrain cells are 1 texel each and are read at a glance while moving, so
 * require roughly four times that: 0.08. For reference, the palette this
 * test was introduced with (#70) had exact duplicates (0.000) and a tightest
 * real pair of 0.027, both of which fail here. Every value below is measured
 * from the hex constants, so it is exact rather than aspirational.
 */
const MIN_PALETTE_DISTANCE = 0.08

/**
 * Minerals must stay readable inside the terrain they are embedded in: coal
 * sits in stone, iron/crystal/relic in stone or deep soils, and all of them
 * are surrounded by air once exposed. This is deliberately weaker than
 * `MIN_PALETTE_DISTANCE` only in the sense that it is measured against the
 * background blocks rather than the whole palette.
 */
const MIN_MINERAL_BACKGROUND_DISTANCE = 0.11

const BACKGROUND_BLOCKS: readonly BlockType[] = ['air', 'bedrock', 'stone']

type Swatch = { name: string; hex: string; group: 'block' | 'building' }

const SWATCHES: readonly Swatch[] = [
  ...BLOCK_ID_LIST.map((block) => ({
    name: block,
    hex: BLOCK_COLORS[block],
    group: 'block' as const,
  })),
  ...(Object.keys(BUILDING_DEFINITIONS) as BuildingType[]).map((type) => ({
    name: `building:${type}`,
    hex: BUILDING_COLORS[type],
    group: 'building' as const,
  })),
]

function closestPair(swatches: readonly Swatch[]): {
  a: string
  b: string
  distance: number
} {
  let worst = { a: '', b: '', distance: Number.POSITIVE_INFINITY }
  for (let i = 0; i < swatches.length; i += 1) {
    for (let j = i + 1; j < swatches.length; j += 1) {
      const value = distance(swatches[i].hex, swatches[j].hex)
      if (value < worst.distance) {
        worst = { a: swatches[i].name, b: swatches[j].name, distance: value }
      }
    }
  }
  return worst
}

describe('palette distinctness', () => {
  it('has a colour for every block and building', () => {
    expect(SWATCHES.length).toBe(
      BLOCK_ID_LIST.length + Object.keys(BUILDING_DEFINITIONS).length,
    )
    for (const swatch of SWATCHES) {
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('separates every pair of colours by at least the minimum distance', () => {
    const worst = closestPair(SWATCHES)

    expect(
      worst.distance,
      `${worst.a} and ${worst.b} are too close to tell apart`,
    ).toBeGreaterThanOrEqual(MIN_PALETTE_DISTANCE)
  })

  it('never lets a building reuse a block colour', () => {
    const buildingSwatches = SWATCHES.filter(
      (swatch) => swatch.group === 'building',
    )
    const blockSwatches = SWATCHES.filter((swatch) => swatch.group === 'block')
    const worst = closestPair([...buildingSwatches, ...blockSwatches])

    expect(worst.distance).toBeGreaterThanOrEqual(MIN_PALETTE_DISTANCE)
    for (const building of buildingSwatches) {
      for (const block of blockSwatches) {
        expect(distance(building.hex, block.hex)).toBeGreaterThan(0.05)
      }
    }
  })

  it('keeps minerals clear of the blocks they are embedded in', () => {
    for (const mineral of MINERAL_BLOCKS) {
      for (const background of BACKGROUND_BLOCKS) {
        const value = distance(BLOCK_COLORS[mineral], BLOCK_COLORS[background])
        expect(
          value,
          `${mineral} is too close to ${background} to read at a glance`,
        ).toBeGreaterThanOrEqual(MIN_MINERAL_BACKGROUND_DISTANCE)
      }
    }
  })
})

describe('palette regression guard', () => {
  // The pre-#70 palette, kept only to prove the thresholds above are not
  // vacuous: these values fail the checks that the current palette passes.
  const LEGACY_PALETTE: readonly Swatch[] = [
    { name: 'air', hex: '#20251f', group: 'block' },
    { name: 'bedrock', hex: '#171b1a', group: 'block' },
    { name: 'grass', hex: '#6f9464', group: 'block' },
    { name: 'dirt', hex: '#87644c', group: 'block' },
    { name: 'sand', hex: '#c8a36b', group: 'block' },
    { name: 'sandstone', hex: '#a27b53', group: 'block' },
    { name: 'red-stone', hex: '#9b5545', group: 'block' },
    { name: 'snow', hex: '#c8d6ce', group: 'block' },
    { name: 'packed-soil', hex: '#73818b', group: 'block' },
    { name: 'ice', hex: '#7ca8b7', group: 'block' },
    { name: 'mushroom', hex: '#a76c88', group: 'block' },
    { name: 'loam', hex: '#725c61', group: 'block' },
    { name: 'clay', hex: '#a16a62', group: 'block' },
    { name: 'stone', hex: '#59615c', group: 'block' },
    { name: 'coal', hex: '#2d3330', group: 'block' },
    { name: 'iron', hex: '#a66c51', group: 'block' },
    { name: 'crystal', hex: '#75b7ae', group: 'block' },
    { name: 'relic', hex: '#dfbd62', group: 'block' },
    { name: 'building:stockpile', hex: '#b89d64', group: 'building' },
    { name: 'building:outpost', hex: '#75b7ae', group: 'building' },
    { name: 'building:depot', hex: '#8ebc75', group: 'building' },
    { name: 'building:bridge', hex: '#a27b53', group: 'building' },
    { name: 'building:ladder', hex: '#dfbd62', group: 'building' },
  ]

  function legacyHex(name: string): string {
    const swatch = LEGACY_PALETTE.find((entry) => entry.name === name)
    if (!swatch) throw new Error(`The legacy palette has no ${name}.`)
    return swatch.hex
  }

  it('rejects the old palette', () => {
    expect(closestPair(LEGACY_PALETTE).distance).toBe(0)
  })

  it('catches the old value collisions even without exact duplicates', () => {
    // Blocks that reused a building colour, as the issue reported.
    expect(legacyHex('sandstone')).toBe(legacyHex('building:bridge'))
    expect(legacyHex('crystal')).toBe(legacyHex('building:outpost'))
    expect(legacyHex('relic')).toBe(legacyHex('building:ladder'))

    const nearCollisions: readonly (readonly [string, string])[] = [
      ['air', 'bedrock'],
      ['coal', 'air'],
      ['iron', 'clay'],
      ['iron', 'sandstone'],
      ['loam', 'stone'],
      ['ice', 'crystal'],
    ]
    for (const [a, b] of nearCollisions) {
      expect(distance(legacyHex(a), legacyHex(b))).toBeLessThan(
        MIN_PALETTE_DISTANCE,
      )
    }
  })
})

import { describe, expect, it } from 'vitest'
import { BLOCK_COLORS } from '../game/content'
import {
  BLOCK_CHIP_ART,
  BLOCK_CHIP_SIZE,
  CRACK_ART,
  CRACK_FRAME_HEIGHT,
  CRACK_FRAME_WIDTH,
  CRACK_STAGES,
  crackColorFor,
  crackStageFor,
  createBlockChip,
  createCrackAtlas,
  relativeLuminance,
} from './blockArt'
import { parseHexColor } from './colorMath'

function texel(data: Uint8Array, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4
  return Array.from(data.subarray(offset, offset + 4))
}

describe('crack art', () => {
  it('has one 8 x 8 frame per stage', () => {
    expect(CRACK_ART.length).toBe(CRACK_STAGES)
    for (const frame of CRACK_ART) {
      expect(frame.length).toBe(CRACK_FRAME_HEIGHT)
      for (const row of frame) {
        expect(row.length).toBe(CRACK_FRAME_WIDTH)
      }
    }
  })

  it('grows the crack with every stage', () => {
    const counts = CRACK_ART.map(
      (frame) => frame.join('').split('c').length - 1,
    )
    for (let i = 1; i < counts.length; i += 1) {
      expect(
        counts[i],
        `stage ${i} covers more than stage ${i - 1}`,
      ).toBeGreaterThan(counts[i - 1])
    }
  })

  it('maps a dig ratio onto a stage, clamped at both ends', () => {
    expect(crackStageFor(0)).toBe(0)
    expect(crackStageFor(0.01)).toBe(0)
    expect(crackStageFor(0.3)).toBe(1)
    expect(crackStageFor(0.75)).toBe(3)
    expect(crackStageFor(1)).toBe(CRACK_STAGES - 1)
    expect(crackStageFor(-1)).toBe(0)
    expect(crackStageFor(4)).toBe(CRACK_STAGES - 1)
  })
})

describe('crack colour', () => {
  it('picks a pale crack on dark blocks', () => {
    const crack = crackColorFor(BLOCK_COLORS.coal)
    expect(relativeLuminance(parseHexColor(crack))).toBeGreaterThan(
      relativeLuminance(parseHexColor(BLOCK_COLORS.coal)),
    )
  })

  it('picks a dark crack on pale blocks', () => {
    const crack = crackColorFor(BLOCK_COLORS.snow)
    expect(relativeLuminance(parseHexColor(crack))).toBeLessThan(
      relativeLuminance(parseHexColor(BLOCK_COLORS.snow)),
    )
  })

  it('stays visibly apart from the block it is drawn over', () => {
    for (const color of Object.values(BLOCK_COLORS)) {
      const crack = crackColorFor(color)
      const block = parseHexColor(color)
      const ink = parseHexColor(crack)
      const delta =
        Math.abs(block[0] - ink[0]) +
        Math.abs(block[1] - ink[1]) +
        Math.abs(block[2] - ink[2])
      expect(delta, `crack on ${color}`).toBeGreaterThan(90)
    }
  })
})

describe('crack atlas', () => {
  it('lays every stage out in one row of frames', () => {
    const data = createCrackAtlas(BLOCK_COLORS.stone)
    expect(data.length).toBe(
      CRACK_STAGES * CRACK_FRAME_WIDTH * CRACK_FRAME_HEIGHT * 4,
    )
    // The first texel of every frame is empty, and stage 0 has ink in it.
    for (let stage = 0; stage < CRACK_STAGES; stage += 1) {
      expect(
        texel(
          data,
          CRACK_STAGES * CRACK_FRAME_WIDTH,
          stage * CRACK_FRAME_WIDTH,
          0,
        ),
      ).toEqual([0, 0, 0, 0])
    }
    const painted = Array.from(data).filter((_, index) => index % 4 === 3)
    expect(painted.some((alpha) => alpha === 255)).toBe(true)
  })
})

describe('carried block chip', () => {
  it('is a bevelled square with a dark outline', () => {
    expect(BLOCK_CHIP_ART.length).toBe(BLOCK_CHIP_SIZE)
    for (const row of BLOCK_CHIP_ART) {
      expect(row.length).toBe(BLOCK_CHIP_SIZE)
    }
    const data = createBlockChip(BLOCK_COLORS.iron)
    // Corners are cut away, the outline ring is opaque.
    expect(texel(data, BLOCK_CHIP_SIZE, 0, 0)[3]).toBe(0)
    expect(texel(data, BLOCK_CHIP_SIZE, 1, 0)[3]).toBe(255)
  })

  it('uses the block colour itself in the middle', () => {
    const data = createBlockChip(BLOCK_COLORS.crystal)
    const [r, g, b] = parseHexColor(BLOCK_COLORS.crystal)
    const middle = texel(data, BLOCK_CHIP_SIZE, 2, 3)
    // The left column is a highlight and the right a shadow, so the block
    // colour appears at least once per chip.
    const flat = Array.from(data)
    let found = false
    for (let i = 0; i < flat.length; i += 4) {
      if (flat[i] === r && flat[i + 1] === g && flat[i + 2] === b) found = true
    }
    expect(found).toBe(true)
    expect(middle[3]).toBe(255)
  })
})

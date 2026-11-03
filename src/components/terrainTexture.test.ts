import { describe, expect, it } from 'vitest'
import { cellsFromBlocks } from '../game/blocks'
import { BLOCK_COLORS } from '../game/content'
import type { BlockType, World } from '../game/types'
import { parseHexColor } from './colorMath'
import {
  DEPTH_DARKEN,
  depthFactorFor,
  shadeForDepth,
  TERRAIN_TEXELS_PER_CELL,
} from './terrainShading'
import {
  BYTES_PER_TEXEL,
  fillTerrainTexels,
  TERRAIN_PALETTE,
  terrainBufferLength,
} from './terrainTexture'

const SIZE = TERRAIN_TEXELS_PER_CELL

/** World from rows listed bottom-up, `width` cells per row. */
function makeWorld(rows: readonly (readonly BlockType[])[], width: number) {
  return {
    width,
    height: rows.length,
    cells: cellsFromBlocks(rows.flat()),
    seed: 'test',
    runNumber: 1,
    surfaceHeights: [],
    biomes: [],
    start: { x: 0, y: 0 },
    stockpile: { x: 0, y: 0 },
    buildings: [],
  } satisfies World
}

function texelAt(
  buffer: Uint8Array,
  width: number,
  x: number,
  y: number,
): number[] {
  const offset = (y * width * SIZE + x) * BYTES_PER_TEXEL
  return Array.from(buffer.subarray(offset, offset + BYTES_PER_TEXEL))
}

/** Centre texel of a cell, which never carries an edge highlight. */
function centreOf(buffer: Uint8Array, width: number, x: number, y: number) {
  const middle = Math.floor(SIZE / 2)
  return texelAt(buffer, width, x * SIZE + middle, y * SIZE + middle)
}

/** Bottom, middle and top texel rows of a cell's left/centre column. */
function rowsOf(buffer: Uint8Array, width: number, x: number, y: number) {
  const middle = Math.floor(SIZE / 2)
  return {
    bottom: texelAt(buffer, width, x * SIZE + middle, y * SIZE),
    middle: centreOf(buffer, width, x, y),
    top: texelAt(buffer, width, x * SIZE + middle, y * SIZE + SIZE - 1),
  }
}

function fill(world: World): Uint8Array {
  const out = new Uint8Array(terrainBufferLength(world.width, world.height))
  fillTerrainTexels(world, out)
  return out
}

function rgbOf(block: BlockType): number[] {
  return [...parseHexColor(BLOCK_COLORS[block]), 255]
}

function luma(pixel: number[]): number {
  return pixel[0] + pixel[1] + pixel[2]
}

function distance(a: number[], b: number[]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
}

describe('terrain texel fill', () => {
  it('sizes the buffer at four bytes per supersampled texel', () => {
    expect(terrainBufferLength(160, 80)).toBe(160 * SIZE * 80 * SIZE * 4)
  })

  it('keeps world y = 0 (bedrock) in texture row 0, not flipped', () => {
    // Bottom row bedrock, top row iron.
    const out = fill(makeWorld([['bedrock'], ['iron']], 1))

    expect(centreOf(out, 1, 0, 0)).toEqual(rgbOf('bedrock'))
    expect(distance(centreOf(out, 1, 0, 1), rgbOf('iron'))).toBeLessThan(60)
  })

  it('darkens solid blocks with depth below the column surface', () => {
    // A 42-cell stone column next to a lone surface stone.
    const rows: BlockType[][] = []
    for (let y = 0; y < 42; y += 1)
      rows.push(['stone', y === 0 ? 'stone' : 'air'])
    const out = fill(makeWorld(rows, 2))

    const deep = centreOf(out, 2, 0, 0)
    const shallow = centreOf(out, 2, 1, 0)

    expect(luma(deep)).toBeLessThan(luma(shallow))
    // The deep cell is about one full shade step darker.
    expect(distance(deep, shallow)).toBeGreaterThan(20)
  })

  it('never darkens a block past the configured maximum', () => {
    const rows: BlockType[][] = []
    for (let y = 0; y < 60; y += 1) rows.push(['stone'])
    const out = fill(makeWorld(rows, 1))
    const base = parseHexColor(BLOCK_COLORS.stone)
    const deepest = centreOf(out, 1, 0, 0)
    const floor = Math.floor(base[0] * (1 - DEPTH_DARKEN)) - 1
    expect(deepest[0]).toBeGreaterThanOrEqual(floor)
    expect(depthFactorFor(0)).toBe(1)
  })

  it('lights the top edge of a block that faces air', () => {
    // air / stone / stone: the middle cell has air above it.
    const out = fill(makeWorld([['stone'], ['stone'], ['air']], 1))
    const { bottom, middle, top } = rowsOf(out, 1, 0, 1)

    expect(luma(top)).toBeGreaterThan(luma(middle))
    expect(luma(bottom)).toBe(luma(middle))
  })

  it('shadows the underside of a block that faces air', () => {
    // air / stone / stone: the middle cell overhangs air with rock above.
    const out = fill(makeWorld([['air'], ['stone'], ['stone']], 1))
    const { bottom, middle, top } = rowsOf(out, 1, 0, 1)

    expect(luma(bottom)).toBeLessThan(luma(middle))
    expect(luma(top)).toBe(luma(middle))
  })

  it('lights the side of a block that faces air', () => {
    const out = fill(makeWorld([['stone', 'air']], 2))
    const litSide = texelAt(out, 2, SIZE - 1, 0)
    const middle = centreOf(out, 2, 0, 0)
    expect(luma(litSide)).toBeGreaterThan(luma(middle))
  })

  it('shades air above the surface with a sky gradient', () => {
    const out = fill(makeWorld([['stone'], ['air'], ['air'], ['air']], 1))
    const low = centreOf(out, 1, 0, 1)
    const high = centreOf(out, 1, 0, 3)

    expect(distance(low, high)).toBeGreaterThan(0)
    expect(luma(high)).toBeLessThan(luma(low))
  })

  it('darkens air inside a tunnel with the depth of the pocket', () => {
    const tunnel = centreOf(
      fill(makeWorld([['stone'], ['air'], ['stone'], ['stone']], 1)),
      1,
      0,
      1,
    )
    const openSky = centreOf(
      fill(makeWorld([['stone'], ['air'], ['air'], ['air']], 1)),
      1,
      0,
      1,
    )
    expect(luma(tunnel)).toBeLessThan(luma(openSky))
  })

  it('rewrites in place so a mined cell becomes air', () => {
    const world = makeWorld([['stone'], ['stone']], 1)
    const out = fill(world)
    const mined = { ...world, cells: world.cells.slice() }
    mined.cells[1] = 0
    fillTerrainTexels(mined, out)

    expect(luma(centreOf(out, 1, 0, 1))).toBeLessThan(luma(rgbOf('stone')))
  })

  it('has a palette entry for every block id', () => {
    expect(TERRAIN_PALETTE.length).toBe(18 * BYTES_PER_TEXEL)
  })

  it('matches shadeForDepth in the middle of a cell', () => {
    const out = fill(makeWorld([['stone']], 1))
    const expected = shadeForDepth(parseHexColor(BLOCK_COLORS.stone), 0)
    expect(centreOf(out, 1, 0, 0)).toEqual([...expected, 255])
  })
})

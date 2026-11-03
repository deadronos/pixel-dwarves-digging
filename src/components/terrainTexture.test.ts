import { describe, expect, it } from 'vitest'
import { cellsFromBlocks } from '../game/blocks'
import { BLOCK_COLORS } from '../game/content'
import {
  BYTES_PER_TEXEL,
  fillTerrainTexels,
  TERRAIN_PALETTE,
  terrainBufferLength,
} from './terrainTexture'

function hexToRgba(hex: string): number[] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255]
}

function texelAt(
  buffer: Uint8Array,
  width: number,
  x: number,
  y: number,
): number[] {
  const offset = (y * width + x) * BYTES_PER_TEXEL
  return Array.from(buffer.subarray(offset, offset + BYTES_PER_TEXEL))
}

describe('terrain texel fill', () => {
  // 2 x 2 world, row-major with y = 0 first (the bottom row).
  const width = 2
  const height = 2
  const cells = cellsFromBlocks(['bedrock', 'stone', 'air', 'iron'])

  function fill(): Uint8Array {
    const out = new Uint8Array(terrainBufferLength(width, height))
    fillTerrainTexels(cells, out)
    return out
  }

  it('sizes the buffer at four bytes per cell', () => {
    expect(terrainBufferLength(160, 80)).toBe(160 * 80 * 4)
  })

  it('writes the block colour at the cell position', () => {
    const out = fill()

    expect(texelAt(out, width, 1, 0)).toEqual(hexToRgba(BLOCK_COLORS.stone))
    expect(texelAt(out, width, 1, 1)).toEqual(hexToRgba(BLOCK_COLORS.iron))
  })

  it('keeps world y = 0 (bedrock) in texture row 0, not flipped', () => {
    const out = fill()

    expect(texelAt(out, width, 0, 0)).toEqual(hexToRgba(BLOCK_COLORS.bedrock))
    expect(texelAt(out, width, 0, 1)).toEqual(hexToRgba(BLOCK_COLORS.air))
  })

  it('renders air as the opaque background colour', () => {
    expect(hexToRgba('#20251f')).toEqual(hexToRgba(BLOCK_COLORS.air))
    expect(texelAt(fill(), width, 0, 1)).toEqual([0x20, 0x25, 0x1f, 255])
  })

  it('rewrites in place so a mined cell becomes air', () => {
    const out = fill()
    const mined = cells.slice()
    mined[1] = 0
    fillTerrainTexels(mined, out)

    expect(texelAt(out, width, 1, 0)).toEqual(hexToRgba(BLOCK_COLORS.air))
  })

  it('has a palette entry for every block id', () => {
    expect(TERRAIN_PALETTE.length).toBe(18 * BYTES_PER_TEXEL)
  })
})

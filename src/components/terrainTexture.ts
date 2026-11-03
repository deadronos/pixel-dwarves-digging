import { BLOCK_ID_LIST } from '../game/blocks'
import { BLOCK_COLORS } from '../game/content'

export const BYTES_PER_TEXEL = 4

function parseHexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * RGBA bytes (sRGB) for every block id, built from `BLOCK_COLORS`. Air maps to
 * its own colour, which doubles as the scene background.
 */
export const TERRAIN_PALETTE: Uint8Array = (() => {
  const palette = new Uint8Array(BLOCK_ID_LIST.length * BYTES_PER_TEXEL)
  BLOCK_ID_LIST.forEach((block, id) => {
    const [r, g, b] = parseHexColor(BLOCK_COLORS[block])
    palette.set([r, g, b, 255], id * BYTES_PER_TEXEL)
  })
  return palette
})()

/** Size in bytes of the RGBA buffer for a width x height world. */
export function terrainBufferLength(width: number, height: number): number {
  return width * height * BYTES_PER_TEXEL
}

/**
 * Writes one RGBA texel per cell into `out`. Texel (x, y) is cell (x, y):
 * row 0 is the bottom (bedrock) row, which is also row 0 of a three.js
 * DataTexture (v = 0 at the bottom of the plane), so no vertical flip is
 * needed.
 */
export function fillTerrainTexels(cells: Uint8Array, out: Uint8Array): void {
  for (let index = 0; index < cells.length; index += 1) {
    const source = cells[index] * BYTES_PER_TEXEL
    const target = index * BYTES_PER_TEXEL
    out[target] = TERRAIN_PALETTE[source]
    out[target + 1] = TERRAIN_PALETTE[source + 1]
    out[target + 2] = TERRAIN_PALETTE[source + 2]
    out[target + 3] = TERRAIN_PALETTE[source + 3]
  }
}

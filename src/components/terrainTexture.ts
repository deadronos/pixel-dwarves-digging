import { BLOCK_ID_LIST } from '../game/blocks'
import { BLOCK_COLORS } from '../game/content'
import type { World } from '../game/types'
import { parseHexColor, type Rgb } from './colorMath'
import {
  edgeLit,
  edgeShadowed,
  shadeForDepth,
  skyColorFor,
  TERRAIN_TEXELS_PER_CELL,
  tunnelAirFor,
} from './terrainShading'

export const BYTES_PER_TEXEL = 4

/**
 * Base RGBA bytes (sRGB) for every block id, straight from `BLOCK_COLORS`.
 * This is the unshaded palette: the HUD swatches show these values, while the
 * terrain texture shades them per cell (depth, sky, lit edges).
 */
export const TERRAIN_PALETTE: Uint8Array = (() => {
  const palette = new Uint8Array(BLOCK_ID_LIST.length * BYTES_PER_TEXEL)
  BLOCK_ID_LIST.forEach((block, id) => {
    const [r, g, b] = parseHexColor(BLOCK_COLORS[block])
    palette.set([r, g, b, 255], id * BYTES_PER_TEXEL)
  })
  return palette
})()

const AIR_ID = BLOCK_ID_LIST.indexOf('air')
const AIR_RGB = parseHexColor(BLOCK_COLORS.air)

/** Base colours by block id, so the fill loop never re-parses a hex string. */
const BASE_RGB: readonly Rgb[] = BLOCK_ID_LIST.map((block) =>
  parseHexColor(BLOCK_COLORS[block]),
)

/** Size in bytes of the RGBA buffer for a width x height world. */
export function terrainBufferLength(width: number, height: number): number {
  const texels = TERRAIN_TEXELS_PER_CELL
  return width * texels * height * texels * BYTES_PER_TEXEL
}

/** Topmost solid row per column, or -1 for an empty column. */
function surfaceTops(
  cells: Uint8Array,
  width: number,
  height: number,
): Int16Array {
  const tops = new Int16Array(width).fill(-1)
  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      if (tops[x] === -1 && cells[row + x] !== AIR_ID) tops[x] = y
    }
  }
  return tops
}

/**
 * Whether a cell blocks light. Outside the map counts as solid so the world
 * border does not grow a lit rim along its outside face.
 */
function solidAt(
  cells: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return true
  return cells[y * width + x] !== AIR_ID
}

function writeTexel(
  out: Uint8Array,
  offset: number,
  r: number,
  g: number,
  b: number,
): void {
  out[offset] = r
  out[offset + 1] = g
  out[offset + 2] = b
  out[offset + 3] = 255
}

/**
 * Writes one cell as a `TERRAIN_TEXELS_PER_CELL` square of texels. Edge
 * colours are passed pre-computed (or null): the top row of the cell wins
 * over the bottom row, which wins over the side columns, so a corner keeps
 * the brightest edge.
 */
function writeCell(
  out: Uint8Array,
  texelsPerRow: number,
  cellX: number,
  cellY: number,
  color: Rgb,
  top: Rgb | null,
  bottom: Rgb | null,
  side: Rgb | null,
): void {
  const size = TERRAIN_TEXELS_PER_CELL
  const baseX = cellX * size
  const baseY = cellY * size
  for (let ty = 0; ty < size; ty += 1) {
    // Texture row 0 is the bottom of the world, so texel row 0 is the cell's
    // bottom edge and row size - 1 is its top edge.
    const rowOffset = (baseY + ty) * texelsPerRow
    const rowEdge = ty === size - 1 ? top : ty === 0 ? bottom : null
    for (let tx = 0; tx < size; tx += 1) {
      const edge = rowEdge ?? (tx === 0 || tx === size - 1 ? side : null)
      const [r, g, b] = edge ?? color
      writeTexel(out, (rowOffset + baseX + tx) * BYTES_PER_TEXEL, r, g, b)
    }
  }
}

/**
 * Writes the whole terrain into `out`: one shaded cell per world cell, with
 * `TERRAIN_TEXELS_PER_CELL` texels per axis. Texel (x, y) belongs to cell
 * (floor(x / n), floor(y / n)), and world y = 0 is texture row 0, which is
 * also row 0 of a three.js DataTexture (v = 0 at the bottom of the plane), so
 * no vertical flip is needed.
 *
 * Depth shading is relative to each column's own surface, so a shaft sunk
 * from a hilltop darkens like one sunk from a valley. Air above the surface
 * gets a sky gradient; air inside a tunnel darkens with the pocket's depth.
 */
export function fillTerrainTexels(
  world: Pick<World, 'cells' | 'width' | 'height'>,
  out: Uint8Array,
): void {
  const { cells, width, height } = world
  const size = TERRAIN_TEXELS_PER_CELL
  const texelsPerRow = width * size
  const tops = surfaceTops(cells, width, height)

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      const id = cells[row + x]
      const surface = tops[x]
      const depth = surface > y ? surface - y : 0

      if (id === AIR_ID) {
        const aboveSurface = surface >= 0 && y > surface
        const color = aboveSurface
          ? skyColorFor(y - surface, Math.max(1, height - 1 - surface))
          : tunnelAirFor(AIR_RGB, depth)
        writeCell(out, texelsPerRow, x, y, color, null, null, null)
        continue
      }

      const shaded = shadeForDepth(BASE_RGB[id], depth)
      const topEdge = !solidAt(cells, width, height, x, y + 1)
      const bottomEdge = !solidAt(cells, width, height, x, y - 1)
      const sideEdge =
        !solidAt(cells, width, height, x - 1, y) ||
        !solidAt(cells, width, height, x + 1, y)
      writeCell(
        out,
        texelsPerRow,
        x,
        y,
        shaded,
        topEdge ? edgeLit(shaded, 'top') : null,
        bottomEdge ? edgeShadowed(shaded) : null,
        sideEdge ? edgeLit(shaded, 'side') : null,
      )
    }
  }
}

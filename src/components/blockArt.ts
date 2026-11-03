import { mixRgb, parseHexColor, type Rgb, rgbToHex } from './colorMath'

/**
 * Pixel art for the two mining-feedback overlays: the crack that grows on the
 * block being dug, and the little block chip a hauling dwarf carries.
 *
 * Both are authored as character grids and resolved against a block colour,
 * so they stay in the terrain palette without any image assets.
 */

/** Crack overlay resolution, in texels per world cell. */
export const CRACK_FRAME_WIDTH = 8
export const CRACK_FRAME_HEIGHT = 8

/** How many crack frames a dig passes through. */
export const CRACK_STAGES = 4

/**
 * Crack frames, least to most damaged. `c` is the crack colour, derived from
 * the block being mined so it always contrasts with it.
 */
export const CRACK_ART: readonly (readonly string[])[] = [
  [
    '........',
    '........',
    '........',
    '...cc...',
    '....c...',
    '........',
    '........',
    '........',
  ],
  [
    '........',
    '........',
    '....c...',
    '...cc...',
    '...c....',
    '....c...',
    '...c....',
    '........',
  ],
  [
    '........',
    '....c...',
    '....c...',
    '...cc...',
    '...c.c..',
    '..cc.c..',
    '....cc..',
    '........',
  ],
  [
    '....c...',
    '....c.c.',
    '...cc...',
    '...c.c..',
    '..cc.cc.',
    '.c.c.c..',
    '..cc.c..',
    '.c..c...',
  ],
]

/**
 * Stage of the crack to draw for a 0..1 dig ratio. The first stage shows as
 * soon as work starts so the target is marked immediately.
 */
export function crackStageFor(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio))
  return Math.min(CRACK_STAGES - 1, Math.floor(clamped * CRACK_STAGES))
}

/** Relative luminance (0..1) of an sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * A crack colour that reads on the block it is drawn over: dark blocks get a
 * pale crack, light blocks a dark one. Without this a black crack vanishes on
 * coal and bedrock while a white one vanishes on snow.
 */
export function crackColorFor(blockColor: string): string {
  const rgb = parseHexColor(blockColor)
  return rgbToHex(
    relativeLuminance(rgb) < 0.45
      ? mixRgb(rgb, [240, 245, 250], 0.78)
      : mixRgb(rgb, [10, 12, 14], 0.68),
  )
}

/** Size of the carried-block chip, in texels. */
export const BLOCK_CHIP_SIZE = 6

/**
 * Carried-block chip: a bevelled mini block. `h` is a highlight, `s` a
 * shadow, `c` the block colour itself.
 */
export const BLOCK_CHIP_ART: readonly string[] = [
  '.oooo.',
  'ohhhso',
  'ohccso',
  'ohccso',
  'occcso',
  '.oooo.',
]

const OUTLINE = '#131a1f'

function hexToRgba(hex: string): [number, number, number, number] {
  const [r, g, b] = parseHexColor(hex)
  return [r, g, b, 255]
}

function paint(
  data: Uint8Array,
  width: number,
  originX: number,
  art: readonly string[],
  palette: Readonly<Record<string, [number, number, number, number]>>,
): void {
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const glyph = row[x]
      if (!glyph || glyph === '.') continue
      const color = palette[glyph]
      if (!color) continue
      const offset = (y * width + originX + x) * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = color[3]
    }
  })
}

/**
 * RGBA sheet of every crack stage for one block colour, laid out as one row
 * of frames. Row 0 is the top of the art.
 */
export function createCrackAtlas(blockColor: string): Uint8Array {
  const width = CRACK_STAGES * CRACK_FRAME_WIDTH
  const data = new Uint8Array(width * CRACK_FRAME_HEIGHT * 4)
  const palette = { c: hexToRgba(crackColorFor(blockColor)) }
  CRACK_ART.forEach((frame, stage) => {
    paint(data, width, stage * CRACK_FRAME_WIDTH, frame, palette)
  })
  return data
}

/** RGBA pixels for the carried-block chip of one block colour. */
export function createBlockChip(blockColor: string): Uint8Array {
  const rgb = parseHexColor(blockColor)
  const palette = {
    o: hexToRgba(OUTLINE),
    c: hexToRgba(blockColor),
    h: hexToRgba(rgbToHex(mixRgb(rgb, [255, 255, 255], 0.35))),
    s: hexToRgba(rgbToHex(mixRgb(rgb, [0, 0, 0], 0.3))),
  }
  const data = new Uint8Array(BLOCK_CHIP_SIZE * BLOCK_CHIP_SIZE * 4)
  paint(data, BLOCK_CHIP_SIZE, 0, BLOCK_CHIP_ART, palette)
  return data
}

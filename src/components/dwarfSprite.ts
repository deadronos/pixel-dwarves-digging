import { darkenHex, parseHexColor, type Rgb } from './colorMath'

/**
 * Procedural pixel-art dwarves.
 *
 * Everything here is pure: it turns a body colour plus a pose into RGBA bytes
 * for a sprite sheet `DataTexture`, and picks which frame to show. No image
 * assets, no Three.js, no React — so it is cheap to unit test.
 *
 * One sheet holds every pose frame x every status indicator, laid out as a
 * single row of frames. `DwarfLayer` points one plane at a frame by sliding
 * the texture offset, which keeps a dwarf to one mesh and one draw call.
 */

/** Frame size in texels. One texel is 1/12 of a world cell on screen. */
export const DWARF_FRAME_WIDTH = 12
export const DWARF_FRAME_HEIGHT = 17

/** World-space size of one frame, in cells. */
export const DWARF_SPRITE_WIDTH = 1
export const DWARF_SPRITE_HEIGHT =
  (DWARF_FRAME_HEIGHT / DWARF_FRAME_WIDTH) * DWARF_SPRITE_WIDTH

export const DWARF_POSES = ['idle', 'walk', 'work', 'carry'] as const
export type DwarfPose = (typeof DWARF_POSES)[number]

/** How many frames each pose animates through. */
export const POSE_FRAME_COUNTS: Readonly<Record<DwarfPose, number>> = {
  idle: 1,
  walk: 3,
  work: 3,
  carry: 3,
}

export const DWARF_INDICATORS = ['none', 'working', 'recovery'] as const
export type DwarfIndicator = (typeof DWARF_INDICATORS)[number]

/** Milliseconds per animation frame. */
export const DWARF_FRAME_MS = 150

/**
 * Colours used by the art. The body colour is the dwarf's own palette entry
 * (see `DWARF_COLORS`); every other colour is fixed so all dwarves read as
 * the same species. The dark outline is what keeps a 9 x 13 pixel dwarf
 * legible against the terrain palette.
 */
const SPRITE_COLORS: Readonly<Record<string, string>> = {
  o: '#131a1f',
  h: '#7f8a96',
  H: '#aeb9c4',
  s: '#f0cfa2',
  b: '#e9e1cd',
  l: '#46505c',
  k: '#232a30',
  p: '#cfd7e0',
  w: '#8a6239',
  g: '#f5c542',
  r: '#e2594f',
}

type Pixel = readonly [x: number, y: number, glyph: string]

type SpriteFrame = {
  /** 17 rows of 12 legend chars, top row first. */
  art: readonly string[]
  /** Pixels drawn on top of `art`, e.g. the pickaxe. */
  overlay?: readonly Pixel[]
}

/**
 * Frame art legend:
 *
 * | char | meaning |
 * |---|---|
 * | `.` | transparent |
 * | `o` | outline |
 * | `h` `H` | helmet shade / highlight |
 * | `s` | skin |
 * | `b` | beard |
 * | `t` `T` | tunic (dwarf colour) / tunic shadow |
 * | `l` `k` | trousers / boots |
 * | `p` `w` | pick head / handle |
 * | `g` `r` | working / recovery indicator |
 *
 * Rows 0-2 are reserved for the status indicator, which is stamped on top of
 * the body art when the sheet is built. Rows 3-16 are the dwarf itself.
 */
const BODY_IDLE: readonly string[] = [
  '............',
  '............',
  '............',
  '............',
  '...oooooo...',
  '..ohHHHHho..',
  '..oHHHHHHo..',
  '.oooooooooo.',
  '..osssssso..',
  '..osossoso..',
  '.otbbbbbbto.',
  '.otbbbbbbto.',
  '.ottbbbbtto.',
  '.otttttttto.',
  '.otTTTTTTto.',
  '..ollllllo..',
  '..okk..kko..',
]

/** Same dwarf with the legs together, mid stride. */
const BODY_PASS: readonly string[] = [
  '............',
  '............',
  '............',
  '............',
  '...oooooo...',
  '..ohHHHHho..',
  '..oHHHHHHo..',
  '.oooooooooo.',
  '..osssssso..',
  '..osossoso..',
  '.otbbbbbbto.',
  '.otbbbbbbto.',
  '.ottbbbbtto.',
  '.otttttttto.',
  '.otTTTTTTto.',
  '..ollllllo..',
  '...okkko....',
]

/** Legs apart again, with the far arm swinging forward. */
const BODY_SWING: readonly string[] = [
  '............',
  '............',
  '............',
  '............',
  '...oooooo...',
  '..ohHHHHho..',
  '..oHHHHHHo..',
  '.oooooooooo.',
  '..osssssso..',
  '..osossoso..',
  '.otbbbbbbto.',
  'Totbbbbbbto.',
  '.ottbbbbtto.',
  '.otttttttto.',
  '.otTTTTTTto.',
  '..ollllllo..',
  '..okk..kko..',
]

/** Arms up beside the helmet: the carried block sits above the hands. */
const CARRY_HANDS: readonly Pixel[] = [
  [3, 3, 'T'],
  [8, 3, 'T'],
  [3, 4, 'T'],
  [8, 4, 'T'],
  [2, 5, 'T'],
  [9, 5, 'T'],
  [2, 6, 'T'],
  [9, 6, 'T'],
]

/** Pickaxe raised overhead, ready to swing. */
const PICK_RAISED: readonly Pixel[] = [
  [9, 3, 'p'],
  [10, 3, 'p'],
  [11, 3, 'p'],
  [10, 4, 'w'],
  [10, 5, 'w'],
  [9, 6, 'w'],
  [9, 7, 'w'],
  [8, 8, 'w'],
]

/** Pickaxe swinging through chest height. */
const PICK_SWING: readonly Pixel[] = [
  [8, 8, 'w'],
  [9, 7, 'w'],
  [10, 7, 'w'],
  [11, 6, 'p'],
  [11, 7, 'p'],
  [11, 8, 'p'],
]

/** Pickaxe biting into the block, with a spark. */
const PICK_IMPACT: readonly Pixel[] = [
  [8, 9, 'w'],
  [9, 10, 'w'],
  [10, 11, 'w'],
  [11, 12, 'p'],
  [11, 13, 'p'],
  [10, 13, 'p'],
  [11, 11, 'g'],
]

const FRAME_ART: Readonly<Record<DwarfPose, readonly SpriteFrame[]>> = {
  idle: [{ art: BODY_IDLE }],
  walk: [{ art: BODY_IDLE }, { art: BODY_PASS }, { art: BODY_SWING }],
  work: [
    { art: BODY_IDLE, overlay: PICK_RAISED },
    { art: BODY_IDLE, overlay: PICK_SWING },
    { art: BODY_IDLE, overlay: PICK_IMPACT },
  ],
  carry: [
    { art: BODY_IDLE, overlay: CARRY_HANDS },
    { art: BODY_PASS, overlay: CARRY_HANDS },
    { art: BODY_SWING, overlay: CARRY_HANDS },
  ],
}

/** Indicator glyphs, stamped into rows 0-2. */
const INDICATOR_ART: Readonly<Record<DwarfIndicator, readonly string[]>> = {
  none: ['............', '............', '............'],
  working: ['....g.g.....', '.....g......', '....g.g.....'],
  recovery: ['...r...r....', '....rrr.....', '...r...r....'],
}

/** Total frames in one sheet: every pose frame for every indicator. */
export const DWARF_ATLAS_FRAMES = DWARF_POSES.reduce(
  (total, pose) => total + POSE_FRAME_COUNTS[pose] * DWARF_INDICATORS.length,
  0,
)

export const DWARF_ATLAS_WIDTH = DWARF_ATLAS_FRAMES * DWARF_FRAME_WIDTH
export const DWARF_ATLAS_HEIGHT = DWARF_FRAME_HEIGHT

/** Index of a pose's first frame in the sheet. */
const POSE_SLOT: Readonly<Record<DwarfPose, number>> = (() => {
  const slots = {} as Record<DwarfPose, number>
  let slot = 0
  for (const pose of DWARF_POSES) {
    slots[pose] = slot
    slot += POSE_FRAME_COUNTS[pose] * DWARF_INDICATORS.length
  }
  return slots
})()

/**
 * Sheet slot for one (pose, frame, indicator) combination. Each pose frame is
 * followed by its indicator variants, so the walk cycle keeps the indicator
 * on the same dwarf.
 */
export function dwarfFrameSlot(
  pose: DwarfPose,
  frame: number,
  indicator: DwarfIndicator = 'none',
): number {
  const count = POSE_FRAME_COUNTS[pose]
  const clampedFrame = Math.min(count - 1, Math.max(0, Math.floor(frame)))
  const indicatorIndex = Math.max(0, DWARF_INDICATORS.indexOf(indicator))
  return (
    POSE_SLOT[pose] + clampedFrame * DWARF_INDICATORS.length + indicatorIndex
  )
}

/** UV offset (0..1) of a slot, for `texture.offset.x`. */
export function dwarfFrameOffset(slot: number): number {
  return slot / DWARF_ATLAS_FRAMES
}

/**
 * The pose to draw for a dwarf's current task. Moving wins over the task pose
 * so a walking dwarf visibly walks; work and carry frames are for dwarves
 * standing still at their target.
 */
export function dwarfPoseFor(input: {
  taskKind: 'idle' | 'dig' | 'haul' | 'build'
  carrying: boolean
  moving: boolean
}): DwarfPose {
  if (input.moving) return input.carrying ? 'carry' : 'walk'
  if (input.taskKind === 'dig' || input.taskKind === 'build') return 'work'
  if (input.carrying) return 'carry'
  return 'idle'
}

/**
 * Frame index within a pose for an animation clock in milliseconds. Idle is a
 * single frame, so an idle or paused colony never asks for a new render.
 */
export function dwarfFrameFor(pose: DwarfPose, phaseMs: number): number {
  const count = POSE_FRAME_COUNTS[pose]
  if (count <= 1) return 0
  const step = Math.floor(Math.max(0, phaseMs) / DWARF_FRAME_MS)
  return step % count
}

/** Status indicator: recovery outranks working, which outranks nothing. */
export function dwarfIndicatorFor(input: {
  isRecovery: boolean
  isWorking: boolean
}): DwarfIndicator {
  if (input.isRecovery) return 'recovery'
  return input.isWorking ? 'working' : 'none'
}

/** True when a pose cycles frames, i.e. needs the render loop awake. */
export function isPoseAnimated(pose: DwarfPose): boolean {
  return POSE_FRAME_COUNTS[pose] > 1
}

type Rgba = [number, number, number, number]

function hexToRgba(hex: string): Rgba {
  const [r, g, b] = parseHexColor(hex)
  return [r, g, b, 255]
}

/** Resolves the art legend to RGBA, with `t`/`T` coming from the dwarf. */
function paletteFor(bodyColor: string): Readonly<Record<string, Rgba>> {
  const palette: Record<string, Rgba> = {}
  for (const [key, hex] of Object.entries(SPRITE_COLORS)) {
    palette[key] = hexToRgba(hex)
  }
  palette.t = hexToRgba(bodyColor)
  palette.T = hexToRgba(darkenHex(bodyColor, 0.72))
  return palette
}

/** Writes one frame's pixels into the sheet. */
function paintFrame(
  data: Uint8Array,
  slot: number,
  frame: SpriteFrame,
  indicator: DwarfIndicator,
  palette: Readonly<Record<string, Rgba>>,
): void {
  const originX = slot * DWARF_FRAME_WIDTH
  const overlay = INDICATOR_ART[indicator]
  const pixels = new Map<number, string>()
  for (let y = 0; y < DWARF_FRAME_HEIGHT; y += 1) {
    const row = y < overlay.length ? overlay[y] : (frame.art[y] ?? '')
    for (let x = 0; x < DWARF_FRAME_WIDTH; x += 1) {
      const glyph = row[x]
      if (glyph && glyph !== '.') pixels.set(y * DWARF_FRAME_WIDTH + x, glyph)
    }
  }
  for (const [x, y, glyph] of frame.overlay ?? []) {
    pixels.set(y * DWARF_FRAME_WIDTH + x, glyph)
  }
  for (const [index, glyph] of pixels) {
    const color = palette[glyph]
    if (!color) continue
    const y = Math.floor(index / DWARF_FRAME_WIDTH)
    const x = index % DWARF_FRAME_WIDTH
    const offset = (y * DWARF_ATLAS_WIDTH + originX + x) * 4
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
    data[offset + 3] = color[3]
  }
}

/**
 * Builds one dwarf sheet: RGBA bytes, row-major, top row first, ready for a
 * `DataTexture` with `flipY = false`. Transparent texels stay at alpha 0 so
 * the terrain shows through around the silhouette.
 */
export function createDwarfAtlas(bodyColor: string): Uint8Array {
  const palette = paletteFor(bodyColor)
  const data = new Uint8Array(DWARF_ATLAS_WIDTH * DWARF_ATLAS_HEIGHT * 4)
  for (const pose of DWARF_POSES) {
    const frames = FRAME_ART[pose]
    for (let frame = 0; frame < POSE_FRAME_COUNTS[pose]; frame += 1) {
      const art = frames[Math.min(frame, frames.length - 1)]
      for (const indicator of DWARF_INDICATORS) {
        paintFrame(
          data,
          dwarfFrameSlot(pose, frame, indicator),
          art,
          indicator,
          palette,
        )
      }
    }
  }
  return data
}

/** Exposed for tests and tooling: the fixed colours, without the body colour. */
export const DWARF_SPRITE_PALETTE: Readonly<Record<string, string>> =
  SPRITE_COLORS

/** Exposed for tests: the raw art, without the indicator overlay. */
export const DWARF_FRAME_ART = FRAME_ART

export type DwarfSpriteRgb = Rgb

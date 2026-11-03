import { describe, expect, it } from 'vitest'
import {
  createDwarfAtlas,
  DWARF_ATLAS_FRAMES,
  DWARF_ATLAS_HEIGHT,
  DWARF_ATLAS_WIDTH,
  DWARF_FRAME_ART,
  DWARF_FRAME_HEIGHT,
  DWARF_FRAME_MS,
  DWARF_FRAME_WIDTH,
  DWARF_INDICATORS,
  DWARF_POSES,
  DWARF_SPRITE_PALETTE,
  dwarfFrameFor,
  dwarfFrameOffset,
  dwarfFrameSlot,
  dwarfIndicatorFor,
  dwarfPoseFor,
  isPoseAnimated,
  POSE_FRAME_COUNTS,
} from './dwarfSprite'

const BODY_COLOR = '#c47768'

function texel(data: Uint8Array, x: number, y: number): number[] {
  const offset = (y * DWARF_ATLAS_WIDTH + x) * 4
  return Array.from(data.subarray(offset, offset + 4))
}

function framePixels(data: Uint8Array, slot: number): (number[] | null)[][] {
  const rows: (number[] | null)[][] = []
  for (let y = 0; y < DWARF_FRAME_HEIGHT; y += 1) {
    const row: (number[] | null)[] = []
    for (let x = 0; x < DWARF_FRAME_WIDTH; x += 1) {
      const pixel = texel(data, slot * DWARF_FRAME_WIDTH + x, y)
      row.push(pixel[3] === 0 ? null : pixel)
    }
    rows.push(row)
  }
  return rows
}

function hexToRgba(hex: string): number[] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255]
}

function opaqueCount(data: Uint8Array, slot: number): number {
  return framePixels(data, slot)
    .flat()
    .filter((pixel) => pixel !== null).length
}

describe('dwarf sprite art', () => {
  it('gives every pose frame a full grid of legend characters', () => {
    for (const pose of DWARF_POSES) {
      const frames = DWARF_FRAME_ART[pose]
      expect(frames.length).toBe(POSE_FRAME_COUNTS[pose])
      for (const [index, frame] of frames.entries()) {
        expect(frame.art.length, `${pose}[${index}] row count`).toBe(
          DWARF_FRAME_HEIGHT,
        )
        frame.art.forEach((row, y) => {
          expect(row.length, `${pose}[${index}] row ${y} width`).toBe(
            DWARF_FRAME_WIDTH,
          )
        })
      }
    }
  })

  it('only uses glyphs the sheet knows how to paint', () => {
    const known = new Set(['.', ...Object.keys(DWARF_SPRITE_PALETTE), 't', 'T'])
    for (const pose of DWARF_POSES) {
      for (const frame of DWARF_FRAME_ART[pose]) {
        for (const row of frame.art) {
          for (const glyph of row) {
            expect(known.has(glyph), `unknown glyph ${glyph}`).toBe(true)
          }
        }
      }
    }
  })

  it('lays every pose frame and indicator out in one row', () => {
    const expectedFrames = DWARF_POSES.reduce(
      (total, pose) => total + POSE_FRAME_COUNTS[pose],
      0,
    )
    expect(DWARF_ATLAS_FRAMES).toBe(expectedFrames * DWARF_INDICATORS.length)
    expect(DWARF_ATLAS_WIDTH).toBe(DWARF_ATLAS_FRAMES * DWARF_FRAME_WIDTH)
    expect(DWARF_ATLAS_HEIGHT).toBe(DWARF_FRAME_HEIGHT)
  })

  it('draws an opaque silhouette for every pose', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    for (const pose of DWARF_POSES) {
      const pixels = opaqueCount(data, dwarfFrameSlot(pose, 0))
      // A 12 x 17 frame is 204 texels; a dwarf covers roughly half of it.
      expect(pixels, `${pose} silhouette`).toBeGreaterThan(70)
      expect(pixels, `${pose} silhouette`).toBeLessThan(180)
    }
  })

  it('leaves the space around the silhouette transparent', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    const rows = framePixels(data, dwarfFrameSlot('idle', 0))
    // Corners and the indicator band are empty for a plain idle dwarf.
    expect(rows[0][0]).toBeNull()
    expect(rows[0][DWARF_FRAME_WIDTH - 1]).toBeNull()
    expect(rows[DWARF_FRAME_HEIGHT - 1][0]).toBeNull()
    expect(rows[1].every((pixel) => pixel === null)).toBe(true)
  })

  it('bakes the dwarf colour into the tunic', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    const pixels = framePixels(data, dwarfFrameSlot('idle', 0)).flat()
    const body = hexToRgba(BODY_COLOR)
    expect(pixels.some((pixel) => pixel?.every((v, i) => v === body[i]))).toBe(
      true,
    )
  })

  it('gives each dwarf colour its own sheet', () => {
    const first = createDwarfAtlas('#c47768')
    const second = createDwarfAtlas('#81b2a3')
    expect(Array.from(first)).not.toEqual(Array.from(second))
  })

  it('animates walk, work and carry frames differently', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    for (const pose of ['walk', 'work', 'carry'] as const) {
      const frames = Array.from({ length: POSE_FRAME_COUNTS[pose] }, (_, i) =>
        framePixels(data, dwarfFrameSlot(pose, i))
          .flat()
          .map((pixel) => (pixel ? pixel.join(',') : ''))
          .join('|'),
      )
      expect(new Set(frames).size, `${pose} frames are distinct`).toBe(
        POSE_FRAME_COUNTS[pose],
      )
    }
  })

  it('stamps a working indicator above the head', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    const working = framePixels(data, dwarfFrameSlot('idle', 0, 'working'))
    const gold = hexToRgba(DWARF_SPRITE_PALETTE.g)
    const indicatorRows = working.slice(0, 3).flat()
    expect(
      indicatorRows.some((pixel) => pixel?.every((v, i) => v === gold[i])),
    ).toBe(true)
  })

  it('stamps a recovery indicator above the head', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    const recovery = framePixels(data, dwarfFrameSlot('idle', 0, 'recovery'))
    const red = hexToRgba(DWARF_SPRITE_PALETTE.r)
    expect(
      recovery
        .slice(0, 3)
        .flat()
        .some((pixel) => pixel?.every((v, i) => v === red[i])),
    ).toBe(true)
  })

  it('keeps the indicator band empty when there is nothing to show', () => {
    const data = createDwarfAtlas(BODY_COLOR)
    const none = framePixels(data, dwarfFrameSlot('idle', 0, 'none'))
    expect(
      none
        .slice(0, 3)
        .flat()
        .every((pixel) => pixel === null),
    ).toBe(true)
  })
})

describe('dwarf pose selection', () => {
  it('prefers walking over the task pose', () => {
    expect(
      dwarfPoseFor({ taskKind: 'dig', carrying: false, moving: true }),
    ).toBe('walk')
    expect(
      dwarfPoseFor({ taskKind: 'haul', carrying: true, moving: true }),
    ).toBe('carry')
  })

  it('shows work frames when standing at a dig or build target', () => {
    expect(
      dwarfPoseFor({ taskKind: 'dig', carrying: false, moving: false }),
    ).toBe('work')
    expect(
      dwarfPoseFor({ taskKind: 'build', carrying: true, moving: false }),
    ).toBe('work')
  })

  it('falls back to carry then idle', () => {
    expect(
      dwarfPoseFor({ taskKind: 'haul', carrying: true, moving: false }),
    ).toBe('carry')
    expect(
      dwarfPoseFor({ taskKind: 'idle', carrying: false, moving: false }),
    ).toBe('idle')
  })
})

describe('dwarf frame timing', () => {
  it('holds idle on one frame', () => {
    expect(dwarfFrameFor('idle', 0)).toBe(0)
    expect(dwarfFrameFor('idle', 10_000)).toBe(0)
    expect(isPoseAnimated('idle')).toBe(false)
  })

  it('cycles a walking dwarf through its frames', () => {
    expect(dwarfFrameFor('walk', 0)).toBe(0)
    expect(dwarfFrameFor('walk', DWARF_FRAME_MS)).toBe(1)
    expect(dwarfFrameFor('walk', DWARF_FRAME_MS * 2)).toBe(2)
    expect(dwarfFrameFor('walk', DWARF_FRAME_MS * 3)).toBe(0)
  })

  it('never returns a negative or out-of-range frame', () => {
    for (const pose of DWARF_POSES) {
      expect(dwarfFrameFor(pose, -500)).toBe(0)
      const frame = dwarfFrameFor(pose, 123_456)
      expect(frame).toBeGreaterThanOrEqual(0)
      expect(frame).toBeLessThan(POSE_FRAME_COUNTS[pose])
    }
  })

  it('maps every pose frame and indicator to a unique slot', () => {
    const slots = new Set<number>()
    for (const pose of DWARF_POSES) {
      for (let frame = 0; frame < POSE_FRAME_COUNTS[pose]; frame += 1) {
        for (const indicator of DWARF_INDICATORS) {
          const slot = dwarfFrameSlot(pose, frame, indicator)
          expect(slot).toBeGreaterThanOrEqual(0)
          expect(slot).toBeLessThan(DWARF_ATLAS_FRAMES)
          slots.add(slot)
        }
      }
    }
    expect(slots.size).toBe(DWARF_ATLAS_FRAMES)
  })

  it('clamps a frame index past the end of a pose', () => {
    expect(dwarfFrameSlot('idle', 7)).toBe(dwarfFrameSlot('idle', 0))
  })

  it('spreads frame offsets across the sheet', () => {
    expect(dwarfFrameOffset(0)).toBe(0)
    expect(dwarfFrameOffset(DWARF_ATLAS_FRAMES - 1)).toBeCloseTo(
      1 - 1 / DWARF_ATLAS_FRAMES,
    )
  })
})

describe('dwarf indicator priority', () => {
  it('shows recovery over working', () => {
    expect(dwarfIndicatorFor({ isRecovery: true, isWorking: true })).toBe(
      'recovery',
    )
  })

  it('shows working for any task and nothing for idle', () => {
    expect(dwarfIndicatorFor({ isRecovery: false, isWorking: true })).toBe(
      'working',
    )
    expect(dwarfIndicatorFor({ isRecovery: false, isWorking: false })).toBe(
      'none',
    )
  })
})

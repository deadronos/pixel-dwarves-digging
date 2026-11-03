import { describe, expect, it } from 'vitest'
import {
  createTrack,
  type DwarfTrack,
  interpolationProgress,
  isAnyTrackMoving,
  isTrackMoving,
  lerpTile,
  nextTracks,
  SNAP_DISTANCE_TILES,
  snapDistanceForSpeed,
  tileDistance,
  trackPosition,
} from './dwarfInterpolation'

const TICK_MS = 100

function track(overrides: Partial<DwarfTrack> = {}): DwarfTrack {
  return {
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    startedAt: 1_000,
    durationMs: TICK_MS,
    snap: false,
    ...overrides,
  }
}

describe('interpolation progress', () => {
  it('starts at zero, is linear in between, and clamps at one', () => {
    expect(interpolationProgress(1_000, 1_000, TICK_MS)).toBe(0)
    expect(interpolationProgress(1_050, 1_000, TICK_MS)).toBe(0.5)
    expect(interpolationProgress(1_100, 1_000, TICK_MS)).toBe(1)
  })

  it('clamps before the start and after the end', () => {
    expect(interpolationProgress(900, 1_000, TICK_MS)).toBe(0)
    expect(interpolationProgress(5_000, 1_000, TICK_MS)).toBe(1)
  })

  it('treats a zero or negative duration as finished', () => {
    expect(interpolationProgress(1_000, 1_000, 0)).toBe(1)
    expect(interpolationProgress(1_000, 1_000, -50)).toBe(1)
  })
})

describe('lerp', () => {
  it('hits both endpoints exactly', () => {
    expect(lerpTile({ x: 2, y: 3 }, { x: 5, y: 7 }, 0)).toEqual({ x: 2, y: 3 })
    expect(lerpTile({ x: 2, y: 3 }, { x: 5, y: 7 }, 1)).toEqual({ x: 5, y: 7 })
  })

  it('follows the straight line for multi-tile moves at higher speeds', () => {
    // 4 tiles at 4x speed: still one straight glide, not a diagonal detour.
    expect(lerpTile({ x: 0, y: 0 }, { x: 4, y: 2 }, 0.5)).toEqual({
      x: 2,
      y: 1,
    })
    expect(lerpTile({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.25)).toEqual({
      x: 1,
      y: 0,
    })
  })
})

describe('snap threshold', () => {
  it('lerps ordinary single-tile walking', () => {
    const walk = createTrack({ x: 5, y: 5 }, { x: 6, y: 5 }, 0, TICK_MS)

    expect(walk.snap).toBe(false)
    expect(trackPosition(walk, 50)).toEqual({ x: 5.5, y: 5 })
  })

  it('snaps a first sighting and a jump beyond the threshold', () => {
    expect(createTrack(null, { x: 3, y: 4 }, 0, TICK_MS).snap).toBe(true)
    expect(createTrack({ x: 0, y: 0 }, { x: 0, y: 4 }, 0, TICK_MS).snap).toBe(
      true,
    )
  })

  it('does not snap exactly at the threshold', () => {
    const atThreshold = createTrack(
      { x: 0, y: 0 },
      { x: SNAP_DISTANCE_TILES, y: 0 },
      0,
      TICK_MS,
    )

    expect(atThreshold.snap).toBe(false)
    expect(tileDistance(atThreshold.from, atThreshold.to)).toBeCloseTo(
      SNAP_DISTANCE_TILES,
    )
  })

  it('scales with simulation speed so 2x and 4x walking still glides', () => {
    expect(snapDistanceForSpeed(1)).toBe(SNAP_DISTANCE_TILES)
    expect(snapDistanceForSpeed(2)).toBe(SNAP_DISTANCE_TILES * 2)
    expect(snapDistanceForSpeed(4)).toBe(SNAP_DISTANCE_TILES * 4)

    const fast = createTrack(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      0,
      TICK_MS,
      snapDistanceForSpeed(4),
    )
    expect(fast.snap).toBe(false)
    expect(trackPosition(fast, 50)).toEqual({ x: 2, y: 0 })
  })

  it('snaps a fall of several tiles at 1x speed', () => {
    const fall = createTrack(
      { x: 10, y: 20 },
      { x: 10, y: 12 },
      0,
      TICK_MS,
      snapDistanceForSpeed(1),
    )

    expect(fall.snap).toBe(true)
    expect(trackPosition(fall, 0)).toEqual({ x: 10, y: 12 })
  })
})

describe('movement sampling', () => {
  it('does not move a snapped track at all', () => {
    const snapped = track({
      snap: true,
      from: { x: 1, y: 0 },
      to: { x: 1, y: 0 },
    })

    expect(trackPosition(snapped, 1_000)).toEqual({ x: 1, y: 0 })
    expect(isTrackMoving(snapped, 1_000)).toBe(false)
  })

  it('stops moving once the segment is complete', () => {
    expect(isTrackMoving(track(), 1_050)).toBe(true)
    expect(isTrackMoving(track(), 1_100)).toBe(false)
    expect(trackPosition(track(), 1_100)).toEqual({ x: 1, y: 0 })
  })

  it('is not moving when the dwarf stayed on the same tile', () => {
    const still = track({ from: { x: 4, y: 4 }, to: { x: 4, y: 4 } })

    expect(isTrackMoving(still, 1_000)).toBe(false)
    expect(isAnyTrackMoving([still], 1_000)).toBe(false)
  })
})

describe('is anyone still moving', () => {
  it('is false for an empty set and for finished or snapped tracks', () => {
    expect(isAnyTrackMoving([], 1_000)).toBe(false)
    expect(isAnyTrackMoving([track()], 1_100)).toBe(false)
    expect(isAnyTrackMoving([track({ snap: true })], 1_000)).toBe(false)
  })

  it('is true while a single dwarf is mid-interpolation', () => {
    expect(
      isAnyTrackMoving(
        [track({ snap: true }), track(), track({ startedAt: 900 })],
        1_050,
      ),
    ).toBe(true)
  })
})

describe('rebuilding tracks per tick', () => {
  const dwarves = [
    { id: 'dwarf-1', position: { x: 0, y: 0 } },
    { id: 'dwarf-2', position: { x: 5, y: 5 } },
  ]

  it('chains each dwarf from its previous target', () => {
    const first = nextTracks(new Map(), dwarves, 1_000, TICK_MS, 2.5)
    const second = nextTracks(
      first,
      [
        { id: 'dwarf-1', position: { x: 1, y: 0 } },
        { id: 'dwarf-2', position: { x: 5, y: 5 } },
      ],
      1_100,
      TICK_MS,
      2.5,
    )

    expect(first.get('dwarf-1')?.snap).toBe(true)
    expect(second.get('dwarf-1')).toMatchObject({
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      snap: false,
      startedAt: 1_100,
    })
    // A dwarf that did not move gets a zero-length segment.
    expect(second.get('dwarf-2')).toMatchObject({
      from: { x: 5, y: 5 },
      to: { x: 5, y: 5 },
      snap: false,
    })
    expect(isTrackMoving(second.get('dwarf-2') as DwarfTrack, 1_100)).toBe(
      false,
    )
  })

  it('snaps every dwarf when the id set changes', () => {
    const first = nextTracks(new Map(), dwarves, 1_000, TICK_MS, 2.5)
    const next = nextTracks(
      first,
      [
        { id: 'dwarf-1', position: { x: 1, y: 0 } },
        { id: 'dwarf-3', position: { x: 5, y: 5 } },
      ],
      1_100,
      TICK_MS,
      2.5,
    )

    expect(next.get('dwarf-1')?.snap).toBe(true)
    expect(next.get('dwarf-3')?.snap).toBe(true)
    expect(next.has('dwarf-2')).toBe(false)
  })

  it('drops stale dwarves and keeps the previous target for the rest', () => {
    const first = nextTracks(new Map(), dwarves, 1_000, TICK_MS, 2.5)
    const next = nextTracks(first, [dwarves[0]], 1_100, TICK_MS, 2.5)

    expect([...next.keys()]).toEqual(['dwarf-1'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  createTrack,
  type DwarfTrack,
  interpolationProgress,
  isAnyTrackMoving,
  isTrackMoving,
  lerpTile,
  maxWalkPerTick,
  nextTracks,
  SNAP_MARGIN_TILES,
  snapDistanceFor,
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

describe('walk budget', () => {
  const base = { moveSpeed: 0, satchel: 0 }

  it('is one tile per simulation step, times the speed multiplier', () => {
    expect(maxWalkPerTick(base, 1)).toBe(1)
    expect(maxWalkPerTick(base, 2)).toBe(2)
    expect(maxWalkPerTick(base, 4)).toBe(4)
    expect(maxWalkPerTick({ moveSpeed: 2, satchel: 1 }, 4)).toBe(16)
  })

  it('adds the margin on top of the budget', () => {
    expect(snapDistanceFor(base, 1)).toBe(1 + SNAP_MARGIN_TILES)
    expect(snapDistanceFor({ moveSpeed: 1, satchel: 1 }, 2)).toBe(
      3 * 2 + SNAP_MARGIN_TILES,
    )
  })

  it('ignores nonsense negative upgrade levels', () => {
    expect(maxWalkPerTick({ moveSpeed: -3, satchel: -1 }, 1)).toBe(1)
  })
})

describe('snap threshold', () => {
  it('lerps ordinary single-tile walking', () => {
    const walk = createTrack(
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      0,
      TICK_MS,
      snapDistanceFor({ moveSpeed: 0, satchel: 0 }, 1),
    )

    expect(walk.snap).toBe(false)
    expect(trackPosition(walk, 50)).toEqual({ x: 5.5, y: 5 })
  })

  it('lerps a 2-tile walk with one move-speed level at 1x', () => {
    const upgrades = { moveSpeed: 1, satchel: 0 }
    const walk = createTrack(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      0,
      TICK_MS,
      snapDistanceFor(upgrades, 1),
    )

    expect(walk.snap).toBe(false)
    expect(trackPosition(walk, 50)).toEqual({ x: 1, y: 0 })
  })

  it('lerps a 3-tile haul with move speed and satchel at 1x', () => {
    const upgrades = { moveSpeed: 1, satchel: 1 }
    const haul = createTrack(
      { x: 4, y: 6 },
      { x: 4, y: 3 },
      0,
      TICK_MS,
      snapDistanceFor(upgrades, 1),
    )

    expect(haul.snap).toBe(false)
    expect(trackPosition(haul, 50)).toEqual({ x: 4, y: 4.5 })
  })

  it('snaps a first sighting and a jump beyond the budget', () => {
    const upgrades = { moveSpeed: 1, satchel: 1 }
    const snapDistance = snapDistanceFor(upgrades, 1)

    expect(
      createTrack(null, { x: 3, y: 4 }, 0, TICK_MS, snapDistance).snap,
    ).toBe(true)
    // 4 tiles is one more than the 3-tile budget with these upgrades.
    expect(
      createTrack({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, TICK_MS, snapDistance)
        .snap,
    ).toBe(true)
  })

  it('does not snap exactly at the threshold', () => {
    const atThreshold = createTrack(
      { x: 0, y: 0 },
      { x: 3.5, y: 0 },
      0,
      TICK_MS,
      snapDistanceFor({ moveSpeed: 1, satchel: 1 }, 1),
    )

    expect(atThreshold.snap).toBe(false)
    expect(tileDistance(atThreshold.from, atThreshold.to)).toBeCloseTo(3.5)
  })

  it('keeps uncapped upgrades and higher speeds gliding', () => {
    // 2x with move speed 1: a 4-tile walk is in budget.
    const fast = createTrack(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      0,
      TICK_MS,
      snapDistanceFor({ moveSpeed: 1, satchel: 0 }, 2),
    )
    expect(fast.snap).toBe(false)
    expect(trackPosition(fast, 50)).toEqual({ x: 2, y: 0 })

    // Heavy upgrades at 4x: 20 tiles per tick, still a straight glide.
    const heavy = createTrack(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      0,
      TICK_MS,
      snapDistanceFor({ moveSpeed: 3, satchel: 1 }, 4),
    )
    expect(heavy.snap).toBe(false)
  })

  it('snaps a fall that crosses the whole map at 1x speed', () => {
    const fall = createTrack(
      { x: 10, y: 70 },
      { x: 10, y: 12 },
      0,
      TICK_MS,
      snapDistanceFor({ moveSpeed: 0, satchel: 0 }, 1),
    )

    expect(fall.snap).toBe(true)
    expect(trackPosition(fall, 0)).toEqual({ x: 10, y: 12 })
  })

  it('lerps a single-tile fall as a quick drop', () => {
    const drop = createTrack(
      { x: 7, y: 9 },
      { x: 7, y: 8 },
      0,
      TICK_MS,
      snapDistanceFor({ moveSpeed: 0, satchel: 0 }, 1),
    )

    expect(drop.snap).toBe(false)
    expect(trackPosition(drop, 50)).toEqual({ x: 7, y: 8.5 })
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

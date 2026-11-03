/**
 * Pure interpolation math for dwarf movement between simulation ticks.
 *
 * The simulation advances in 100 ms ticks, but the canvas renders on demand
 * at display rate. Each dwarf therefore carries the segment it is walking
 * (`from` -> `to`) and the time that segment started; the renderer samples it
 * every frame. Keeping the math here (and free of React and Three) means the
 * clamping, the snap threshold and the "still moving" check are unit tested
 * instead of being buried in a `useFrame` callback.
 */

export type TilePoint = {
  x: number
  y: number
}

export type DwarfTrack = {
  /** Tile the segment starts from (equals `to` when the move snapped). */
  from: TilePoint
  /** Tile the simulation says the dwarf is on now. */
  to: TilePoint
  /** Timestamp (ms, `performance.now`) the segment was created at. */
  startedAt: number
  /** Length of the segment in ms — one simulation tick. */
  durationMs: number
  /** Set when the move was too large to animate: draw `to` immediately. */
  snap: boolean
}

/**
 * A walk covers at most `1 + moveSpeed + satchel` tiles per simulation step.
 * Anything beyond a couple of tiles per step (a fall, a new run, a prestige or
 * a save import) is a teleport, not a movement, and lerping it would drag the
 * dwarf across the map. 2.5 tiles sits above every single-step walk and below
 * the shortest realistic fall, so it separates the two cleanly.
 */
export const SNAP_DISTANCE_TILES = 2.5

/**
 * The snap threshold for a run at `speed`. A tick runs `speed` simulation
 * steps, so at 2x and 4x a dwarf legitimately covers several tiles in one
 * update and must still glide along the straight line. Scaling the threshold
 * by speed keeps ordinary walking animated at every speed while continuing to
 * snap falls and resets, which cover far more ground than `speed` steps.
 */
export function snapDistanceForSpeed(speed: number): number {
  return SNAP_DISTANCE_TILES * Math.max(1, speed)
}

/** Euclidean distance in tiles. */
export function tileDistance(from: TilePoint, to: TilePoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/**
 * Progress through a segment, clamped to [0, 1]. A segment with no duration
 * (or one that started in the future, as happens with a clock change) counts
 * as finished so nothing is ever left mid-stride.
 */
export function interpolationProgress(
  now: number,
  startedAt: number,
  durationMs: number,
): number {
  if (!(durationMs > 0)) return 1
  const elapsed = now - startedAt
  if (!(elapsed > 0)) return 0
  if (elapsed >= durationMs) return 1
  return elapsed / durationMs
}

/** Straight-line interpolation between two tiles. */
export function lerpTile(
  from: TilePoint,
  to: TilePoint,
  progress: number,
): TilePoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

/**
 * Builds the segment between where a dwarf was and where the tick put it.
 * `from` is null for a dwarf seen for the first time, which snaps.
 */
export function createTrack(
  from: TilePoint | null,
  to: TilePoint,
  startedAt: number,
  durationMs: number,
  snapDistance: number = SNAP_DISTANCE_TILES,
): DwarfTrack {
  const snap = from === null || tileDistance(from, to) > snapDistance
  return {
    from: snap ? { x: to.x, y: to.y } : { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    startedAt,
    durationMs,
    snap,
  }
}

/** Where to draw the dwarf at `now`. */
export function trackPosition(track: DwarfTrack, now: number): TilePoint {
  if (track.snap) return { x: track.to.x, y: track.to.y }
  return lerpTile(
    track.from,
    track.to,
    interpolationProgress(now, track.startedAt, track.durationMs),
  )
}

/** True while a segment still has distance to cover. */
export function isTrackMoving(track: DwarfTrack, now: number): boolean {
  if (track.snap) return false
  // A dwarf that stayed put has nothing to animate, so it must not keep
  // demand rendering awake for the whole tick.
  if (track.from.x === track.to.x && track.from.y === track.to.y) return false
  return interpolationProgress(now, track.startedAt, track.durationMs) < 1
}

/**
 * Whether any dwarf is still mid-interpolation. The renderer uses this to keep
 * asking for frames while movement is animating, and to stop once everyone has
 * arrived.
 */
export function isAnyTrackMoving(
  tracks: Iterable<DwarfTrack>,
  now: number,
): boolean {
  for (const track of tracks) {
    if (isTrackMoving(track, now)) return true
  }
  return false
}

/**
 * Rebuilds one segment per dwarf from the previous frame set. Every dwarf
 * snaps when the id set changes (new run, save import, prestige), and when a
 * single update moves it further than `snapDistance`.
 */
export function nextTracks(
  previous: ReadonlyMap<string, DwarfTrack>,
  dwarves: readonly { id: string; position: TilePoint }[],
  now: number,
  durationMs: number,
  snapDistance: number = SNAP_DISTANCE_TILES,
): Map<string, DwarfTrack> {
  const sameDwarfSet =
    previous.size === dwarves.length &&
    dwarves.every((dwarf) => previous.has(dwarf.id))
  const tracks = new Map<string, DwarfTrack>()
  for (const dwarf of dwarves) {
    const previousTrack = sameDwarfSet ? previous.get(dwarf.id) : undefined
    tracks.set(
      dwarf.id,
      createTrack(
        previousTrack ? previousTrack.to : null,
        dwarf.position,
        now,
        durationMs,
        snapDistance,
      ),
    )
  }
  return tracks
}

import type { DwarfState, Position, World } from '../game/types'

export type CameraTarget = {
  center: Position
  zoom: number
}

/** Canvas size in CSS pixels. */
export type Viewport = {
  width: number
  height: number
}

type CameraDwarf = Pick<DwarfState, 'position' | 'task'>
type CameraWorld = Pick<World, 'width' | 'height' | 'buildings'>

export const MAX_ZOOM = 22
const MIN_FOLLOW_ZOOM = 12
const MAX_FOLLOW_ZOOM = 18
const FOCUS_PADDING = 6
const WORK_AREA_RADIUS = 10
const AREA_SWITCH_MS = 2_000
const PAN_DEAD_ZONE = 1.5
const ZOOM_DEAD_ZONE = 0.15
const EDGE_MARGIN = 2
export const CAMERA_PAUSE_MS = 6_000
const CAMERA_POSITION_EPSILON = 0.05
const CAMERA_ZOOM_EPSILON = 0.01

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export function dampCameraValue(
  current: number,
  target: number,
  deltaSeconds: number,
  rate: number,
): number {
  if (deltaSeconds <= 0 || rate <= 0) return current
  const alpha = 1 - Math.exp(-rate * deltaSeconds)
  return current + (target - current) * alpha
}

export function hasCameraSettled(
  position: Position,
  zoom: number,
  targetPosition: Position,
  targetZoom: number,
  positionEpsilon = CAMERA_POSITION_EPSILON,
  zoomEpsilon = CAMERA_ZOOM_EPSILON,
): boolean {
  return (
    Math.abs(position.x - targetPosition.x) <= positionEpsilon &&
    Math.abs(position.y - targetPosition.y) <= positionEpsilon &&
    Math.abs(zoom - targetZoom) <= zoomEpsilon
  )
}

export function syncCameraControlTarget(
  controlsTarget: { x: number; y: number },
  cameraPosition: Position,
): void {
  controlsTarget.x = cameraPosition.x
  controlsTarget.y = cameraPosition.y
}

export function isDynamicCameraActive(
  enabled: boolean,
  temporarilyPaused: boolean,
): boolean {
  return enabled && !temporarilyPaused
}

export function createCameraPauseController(durationMs = CAMERA_PAUSE_MS) {
  let pausedUntil = 0
  let dragging = false

  return {
    onDragStart(now: number) {
      dragging = true
      pausedUntil = now + durationMs
    },
    onDragEnd(now: number) {
      dragging = false
      pausedUntil = now + durationMs
    },
    resume() {
      dragging = false
      pausedUntil = 0
    },
    isPaused(now: number): boolean {
      return dragging || now < pausedUntil
    },
  }
}

function clampAxis(center: number, visible: number, extent: number): number {
  if (visible >= extent) return extent / 2
  return clamp(center, visible / 2, extent - visible / 2)
}

/**
 * Keeps an orthographic view inside the world. With R3F's orthographic camera
 * one world unit spans `zoom` CSS pixels, so the view shows
 * `viewport / zoom` cells on each axis. An axis wider than the world is
 * centred instead.
 */
export function clampCameraCenter(
  center: Position,
  zoom: number,
  viewport: Viewport,
  world: Pick<World, 'width' | 'height'>,
): Position {
  const safeZoom = zoom > 0 ? zoom : getMapFitZoom(world, viewport)
  return {
    x: clampAxis(center.x, viewport.width / safeZoom, world.width),
    y: clampAxis(center.y, viewport.height / safeZoom, world.height),
  }
}

export function getMapFitZoom(
  world: Pick<World, 'width' | 'height'>,
  viewport: Viewport,
): number {
  return Math.min(
    Math.max(1, viewport.width) / world.width,
    Math.max(1, viewport.height) / world.height,
  )
}

function tileCenter({ x, y }: Position): Position {
  return { x: x + 0.5, y: y + 0.5 }
}

type Bounds = { left: number; right: number; bottom: number; top: number }
type WorkArea = { bounds: Bounds; center: Position; workers: number }

function includePoint(bounds: Bounds, point: Position): Bounds {
  return {
    left: Math.min(bounds.left, point.x),
    right: Math.max(bounds.right, point.x),
    bottom: Math.min(bounds.bottom, point.y),
    top: Math.max(bounds.top, point.y),
  }
}

function boundsCenter(bounds: Bounds): Position {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.bottom + bounds.top) / 2,
  }
}

function getWorkAreas(dwarves: readonly CameraDwarf[]): WorkArea[] {
  const jobs = dwarves.flatMap(({ position, task }) =>
    task.kind === 'dig' || task.kind === 'build' || task.kind === 'anchor'
      ? [tileCenter(task.target ?? position)]
      : [],
  )
  const points =
    jobs.length > 0 ? jobs : dwarves.map(({ position }) => tileCenter(position))
  return points
    .map((anchor) => {
      const nearby = points.filter(
        (point) => distance(point, anchor) <= WORK_AREA_RADIUS,
      )
      const bounds = nearby.reduce(includePoint, {
        left: anchor.x,
        right: anchor.x,
        bottom: anchor.y,
        top: anchor.y,
      })
      return { bounds, center: boundsCenter(bounds), workers: nearby.length }
    })
    .sort((a, b) => b.workers - a.workers)
}

function fitBounds(bounds: Bounds, viewport: Viewport): number {
  return Math.min(
    viewport.width / (bounds.right - bounds.left + FOCUS_PADDING * 2),
    viewport.height / (bounds.top - bounds.bottom + FOCUS_PADDING * 2),
  )
}

function frameArea(
  area: WorkArea,
  world: CameraWorld,
  viewport: Viewport,
): CameraTarget {
  const min = Math.max(MIN_FOLLOW_ZOOM, getMapFitZoom(world, viewport))
  let bounds = area.bounds
  let nearestStorage = WORK_AREA_RADIUS
  for (const building of world.buildings) {
    if (building.construction !== 'completed' || !building.storage) continue
    const center = {
      x: building.position.x + building.width / 2,
      y: building.position.y + building.height / 2,
    }
    const gap = distance(center, area.center)
    if (gap > nearestStorage) continue
    const expanded = includePoint(area.bounds, center)
    if (fitBounds(expanded, viewport) < min) continue
    nearestStorage = gap
    bounds = expanded
  }
  const zoom = clamp(
    fitBounds(bounds, viewport),
    min,
    Math.max(min, MAX_FOLLOW_ZOOM),
  )
  return {
    center: clampCameraCenter(boundsCenter(bounds), zoom, viewport, world),
    zoom,
  }
}

function workNearEdge(
  work: Bounds,
  target: CameraTarget,
  viewport: Viewport,
  world: CameraWorld,
): boolean {
  const halfWidth = viewport.width / (2 * target.zoom)
  const halfHeight = viewport.height / (2 * target.zoom)
  return (
    Math.max(0, work.left - EDGE_MARGIN) <
      target.center.x - halfWidth - 0.001 ||
    Math.min(world.width, work.right + EDGE_MARGIN) >
      target.center.x + halfWidth + 0.001 ||
    Math.max(0, work.bottom - EDGE_MARGIN) <
      target.center.y - halfHeight - 0.001 ||
    Math.min(world.height, work.top + EDGE_MARGIN) >
      target.center.y + halfHeight + 0.001
  )
}

export function createFollowCamera() {
  let current: WorkArea | undefined
  let contender: { center: Position; since: number } | undefined
  let target: CameraTarget | undefined
  let previousViewport: Viewport | undefined

  return {
    reset() {
      current = undefined
      contender = undefined
      target = undefined
    },
    get switching() {
      return contender !== undefined
    },
    update(
      world: CameraWorld,
      dwarves: readonly CameraDwarf[],
      viewport: Viewport,
      now: number,
    ): CameraTarget {
      if (
        viewport.width !== previousViewport?.width ||
        viewport.height !== previousViewport.height
      ) {
        target = undefined
        previousViewport = viewport
      }
      const areas = getWorkAreas(dwarves)
      const busiest = areas[0]
      if (!busiest) {
        this.reset()
        return {
          center: { x: world.width / 2, y: world.height / 2 },
          zoom: getMapFitZoom(world, viewport),
        }
      }

      const previous = current
      const local =
        previous &&
        areas.find(
          (area) => distance(previous.center, area.center) <= WORK_AREA_RADIUS,
        )
      let selected = local ?? previous ?? busiest
      if (previous && busiest.workers > (local?.workers ?? 0)) {
        if (
          !contender ||
          distance(contender.center, busiest.center) > WORK_AREA_RADIUS
        ) {
          contender = { center: busiest.center, since: now }
        }
        if (now - contender.since >= AREA_SWITCH_MS) {
          selected = busiest
          contender = undefined
        }
      } else {
        contender = undefined
      }
      current = selected
      const desired = frameArea(selected, world, viewport)
      if (!target || (selected !== local && selected !== previous)) {
        target = desired
      } else {
        const nearEdge = workNearEdge(selected.bounds, target, viewport, world)
        const zoom =
          Math.abs(desired.zoom - target.zoom) / target.zoom >=
            ZOOM_DEAD_ZONE ||
          (nearEdge && desired.zoom < target.zoom)
            ? desired.zoom
            : target.zoom
        const center =
          nearEdge || distance(desired.center, target.center) > PAN_DEAD_ZONE
            ? desired.center
            : target.center
        target = {
          center: clampCameraCenter(center, zoom, viewport, world),
          zoom,
        }
      }
      return target
    },
  }
}

export function getCameraTarget(
  world: CameraWorld,
  dwarves: readonly CameraDwarf[],
  viewport: Viewport,
): CameraTarget {
  return createFollowCamera().update(world, dwarves, viewport, 0)
}

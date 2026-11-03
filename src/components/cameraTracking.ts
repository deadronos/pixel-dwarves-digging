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

type CameraDwarf = Pick<DwarfState, 'position' | 'task' | 'movement'>

export const MIN_ZOOM = 5
export const MAX_ZOOM = 22
const FOCUS_PADDING = 6
const ACTIVE_WEIGHT = 4
const IDLE_WEIGHT = 1
export const CAMERA_PAUSE_MS = 2_500
const CAMERA_POSITION_EPSILON = 0.05
const CAMERA_ZOOM_EPSILON = 0.01

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function isActive(dwarf: CameraDwarf): boolean {
  return dwarf.movement !== 'grounded' || dwarf.task.kind !== 'idle'
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
  const safeZoom = zoom > 0 ? zoom : MIN_ZOOM
  return {
    x: clampAxis(center.x, viewport.width / safeZoom, world.width),
    y: clampAxis(center.y, viewport.height / safeZoom, world.height),
  }
}

export function getCameraTarget(
  world: Pick<World, 'width' | 'height'>,
  dwarves: ReadonlyArray<CameraDwarf>,
  viewport: Viewport,
): CameraTarget {
  const safeViewport = {
    width: Math.max(1, viewport.width),
    height: Math.max(1, viewport.height),
  }
  if (dwarves.length === 0) {
    return {
      center: clampCameraCenter(
        { x: world.width / 2, y: world.height / 2 },
        MIN_ZOOM,
        safeViewport,
        world,
      ),
      zoom: MIN_ZOOM,
    }
  }

  let totalWeight = 0
  let weightedX = 0
  let weightedY = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const dwarf of dwarves) {
    const weight = isActive(dwarf) ? ACTIVE_WEIGHT : IDLE_WEIGHT
    totalWeight += weight
    weightedX += dwarf.position.x * weight
    weightedY += dwarf.position.y * weight
    minX = Math.min(minX, dwarf.position.x)
    minY = Math.min(minY, dwarf.position.y)
    maxX = Math.max(maxX, dwarf.position.x)
    maxY = Math.max(maxY, dwarf.position.y)
  }

  const paddedWidth = Math.max(1, maxX - minX + FOCUS_PADDING * 2)
  const paddedHeight = Math.max(1, maxY - minY + FOCUS_PADDING * 2)
  // Pixels per cell that fit the padded focus box on both axes.
  const zoom = clamp(
    Math.min(
      safeViewport.width / paddedWidth,
      safeViewport.height / paddedHeight,
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  )
  const center = clampCameraCenter(
    { x: weightedX / totalWeight, y: weightedY / totalWeight },
    zoom,
    safeViewport,
    world,
  )

  return { center, zoom }
}

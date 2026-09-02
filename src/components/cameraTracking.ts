import type { DwarfState, Position, World } from '../game/types'

export type CameraTarget = {
  center: Position
  zoom: number
}

type CameraDwarf = Pick<DwarfState, 'position' | 'task' | 'movement'>

const MIN_ZOOM = 5
const MAX_ZOOM = 22
const FOCUS_PADDING = 6
const BASE_VIEW_SIZE = 100
const ACTIVE_WEIGHT = 4
const IDLE_WEIGHT = 1
export const CAMERA_PAUSE_MS = 2_500

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

export function isDynamicCameraActive(
  enabled: boolean,
  temporarilyPaused: boolean,
): boolean {
  return enabled && !temporarilyPaused
}

export function createCameraPauseController(durationMs = CAMERA_PAUSE_MS) {
  let pausedUntil = 0

  return {
    onInput(now: number) {
      pausedUntil = now + durationMs
    },
    isPaused(now: number): boolean {
      return now < pausedUntil
    },
  }
}

export function getCameraTarget(
  world: Pick<World, 'width' | 'height'>,
  dwarves: ReadonlyArray<CameraDwarf>,
  aspect: number,
): CameraTarget {
  if (dwarves.length === 0) {
    return {
      center: { x: world.width / 2, y: world.height / 2 },
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

  const center = {
    x: clamp(weightedX / totalWeight, 0, world.width),
    y: clamp(weightedY / totalWeight, 0, world.height),
  }
  const paddedWidth = Math.max(1, maxX - minX + FOCUS_PADDING * 2)
  const paddedHeight = Math.max(1, maxY - minY + FOCUS_PADDING * 2)
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const requiredViewSize = Math.max(paddedWidth / safeAspect, paddedHeight)
  const zoom = clamp(BASE_VIEW_SIZE / requiredViewSize, MIN_ZOOM, MAX_ZOOM)

  return { center, zoom }
}

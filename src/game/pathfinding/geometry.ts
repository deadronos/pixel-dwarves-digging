import type { Position } from '../types'

export function isInBounds(
  world: Pick<{ width: number; height: number }, 'width' | 'height'>,
  position: Position,
): boolean {
  return (
    position.x >= 0 &&
    position.x < world.width &&
    position.y >= 0 &&
    position.y < world.height
  )
}

export function isClearedPosition(
  position: Position,
  cleared?: Position,
): boolean {
  return (
    cleared !== undefined &&
    position.x === cleared.x &&
    position.y === cleared.y
  )
}

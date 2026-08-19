import { getCell } from './generation'
import type { Position, World } from './types'

const DIRECTIONS: Position[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
]

function key(position: Position): string {
  return `${position.x}:${position.y}`
}

function isInBounds(world: World, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < world.width &&
    position.y >= 0 &&
    position.y < world.height
  )
}

function isWalkable(world: World, position: Position): boolean {
  return (
    isInBounds(world, position) &&
    getCell(world, position.x, position.y).block === 'air'
  )
}

function neighbors(position: Position): Position[] {
  return DIRECTIONS.map((direction) => ({
    x: position.x + direction.x,
    y: position.y + direction.y,
  }))
}

export function findPath(
  world: World,
  from: Position,
  to: Position,
): Position[] | null {
  if (from.x === to.x && from.y === to.y) return []
  if (!isWalkable(world, from) || !isWalkable(world, to)) return null

  const queue: Position[] = [from]
  const visited = new Set([key(from)])
  const previous = new Map<string, Position>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    for (const next of neighbors(current)) {
      if (!isInBounds(world, next)) continue
      const nextKey = key(next)
      if (visited.has(nextKey) || !isWalkable(world, next)) continue

      visited.add(nextKey)
      previous.set(nextKey, current)

      if (next.x === to.x && next.y === to.y) {
        const path: Position[] = []
        let cursor = next
        while (cursor.x !== from.x || cursor.y !== from.y) {
          path.unshift(cursor)
          const parent = previous.get(key(cursor))
          if (!parent) return null
          cursor = parent
        }
        return path
      }

      queue.push(next)
    }
  }

  return null
}

export function findAdjacentPaths(
  world: World,
  from: Position,
  target: Position,
): Array<{ path: Position[]; stand: Position }> {
  return neighbors(target)
    .map((stand) => {
      const path = findPath(world, from, stand)
      return path ? { path, stand } : null
    })
    .filter(
      (result): result is { path: Position[]; stand: Position } =>
        result !== null,
    )
    .sort((first, second) => first.path.length - second.path.length)
}

export function findExposedSolids(world: World, from: Position): Position[] {
  const queue: Position[] = [from]
  const visited = new Set([key(from)])
  const targets: Position[] = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    for (const next of neighbors(current)) {
      if (!isInBounds(world, next)) continue
      const nextKey = key(next)
      const cell = getCell(world, next.x, next.y)
      if (cell.block !== 'air') {
        targets.push(next)
      } else if (!visited.has(nextKey)) {
        visited.add(nextKey)
        queue.push(next)
      }
    }
  }

  return targets.filter(
    (target, index) =>
      targets.findIndex((candidate) => key(candidate) === key(target)) ===
      index,
  )
}

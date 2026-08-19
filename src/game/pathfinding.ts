import { getCell } from './generation'
import { indexFor, type Position, type World } from './types'

const DIRECTIONS: Position[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
]

type SearchResult = {
  fromIndex: number
  queue: Int32Array
  count: number
  previous: Int32Array
  distance: Int32Array
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

function positionFor(index: number, width: number): Position {
  return { x: index % width, y: Math.floor(index / width) }
}

function createSearch(world: World, from: Position): SearchResult | null {
  if (!isWalkable(world, from)) return null

  const size = world.width * world.height
  const fromIndex = indexFor(from.x, from.y, world.width)
  const queue = new Int32Array(size)
  const previous = new Int32Array(size)
  const distance = new Int32Array(size)
  previous.fill(-1)
  distance.fill(-1)

  let head = 0
  let tail = 1
  queue[0] = fromIndex
  distance[fromIndex] = 0

  while (head < tail) {
    const currentIndex = queue[head]
    head += 1
    const current = positionFor(currentIndex, world.width)

    for (const direction of DIRECTIONS) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }
      if (!isWalkable(world, next)) continue

      const nextIndex = indexFor(next.x, next.y, world.width)
      if (distance[nextIndex] !== -1) continue

      distance[nextIndex] = distance[currentIndex] + 1
      previous[nextIndex] = currentIndex
      queue[tail] = nextIndex
      tail += 1
    }
  }

  return { fromIndex, queue, count: tail, previous, distance }
}

function reconstructPath(
  search: SearchResult,
  targetIndex: number,
  width: number,
): Position[] | null {
  if (targetIndex === search.fromIndex) return []
  if (search.distance[targetIndex] === -1) return null

  const reversed: Position[] = []
  let cursor = targetIndex
  while (cursor !== search.fromIndex) {
    reversed.push(positionFor(cursor, width))
    cursor = search.previous[cursor]
    if (cursor === -1) return null
  }
  reversed.reverse()
  return reversed
}

export type ReachableExposedSolid = {
  target: Position
  path: Position[]
}

export function findReachableExposedSolids(
  world: World,
  from: Position,
): ReachableExposedSolid[] {
  const search = createSearch(world, from)
  if (!search) return []

  const exposed = new Uint8Array(world.width * world.height)
  const results: ReachableExposedSolid[] = []

  for (let index = 0; index < search.count; index += 1) {
    const standIndex = search.queue[index]
    const stand = positionFor(standIndex, world.width)

    for (const direction of DIRECTIONS) {
      const target = {
        x: stand.x + direction.x,
        y: stand.y + direction.y,
      }
      if (!isInBounds(world, target)) continue

      const targetIndex = indexFor(target.x, target.y, world.width)
      if (exposed[targetIndex] || getCell(world, target.x, target.y).block === 'air') {
        continue
      }

      const path = reconstructPath(search, standIndex, world.width)
      if (!path) continue
      exposed[targetIndex] = 1
      results.push({ target, path })
    }
  }

  return results
}

export function findPath(
  world: World,
  from: Position,
  to: Position,
): Position[] | null {
  if (from.x === to.x && from.y === to.y) return []
  if (!isWalkable(world, from) || !isWalkable(world, to)) return null

  const search = createSearch(world, from)
  if (!search) return null

  return reconstructPath(
    search,
    indexFor(to.x, to.y, world.width),
    world.width,
  )
}

export function findAdjacentPaths(
  world: World,
  from: Position,
  target: Position,
): Array<{ path: Position[]; stand: Position }> {
  return DIRECTIONS.map((direction) => {
    const stand = {
      x: target.x + direction.x,
      y: target.y + direction.y,
    }
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
  return findReachableExposedSolids(world, from).map(({ target }) => target)
}

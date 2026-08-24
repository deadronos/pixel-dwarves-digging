import { MINEABLE_BLOCK_SET } from './content'
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

type NavigationIndex = {
  floors: Uint8Array
  ladders: Uint8Array
}

const navigationIndexCache = new WeakMap<World, NavigationIndex>()
const searchCache = new WeakMap<World, Map<string, SearchResult | null>>()
const pathCache = new WeakMap<World, Map<string, Position[] | null>>()

function isInBounds(world: World, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < world.width &&
    position.y >= 0 &&
    position.y < world.height
  )
}

function createNavigationIndex(world: World): NavigationIndex {
  const floors = new Uint8Array(world.width * world.height)
  const ladders = new Uint8Array(world.width * world.height)

  for (const building of world.buildings) {
    if (building.construction !== 'completed') continue
    for (
      let y = building.position.y;
      y < building.position.y + building.height;
      y += 1
    ) {
      for (
        let x = building.position.x;
        x < building.position.x + building.width;
        x += 1
      ) {
        if (!isInBounds(world, { x, y })) continue
        const index = indexFor(x, y, world.width)
        if (building.type === 'ladder') {
          ladders[index] = 1
        } else {
          floors[index] = 1
        }
      }
    }
  }

  return { floors, ladders }
}

function navigationIndex(world: World): NavigationIndex {
  const cached = navigationIndexCache.get(world)
  if (cached) return cached
  const created = createNavigationIndex(world)
  navigationIndexCache.set(world, created)
  return created
}

function hasFloor(world: World, position: Position): boolean {
  return (
    navigationIndex(world).floors[
      indexFor(position.x, position.y, world.width)
    ] === 1
  )
}

function hasLadder(world: World, position: Position): boolean {
  return (
    navigationIndex(world).ladders[
      indexFor(position.x, position.y, world.width)
    ] === 1
  )
}

function isCleared(position: Position, cleared?: Position): boolean {
  return (
    cleared !== undefined &&
    position.x === cleared.x &&
    position.y === cleared.y
  )
}

function isAir(world: World, position: Position, cleared?: Position): boolean {
  return isCleared(position, cleared)
    ? true
    : getCell(world, position.x, position.y).block === 'air'
}

export function isSupported(
  world: World,
  position: Position,
  cleared?: Position,
): boolean {
  if (!isInBounds(world, position)) return false
  if (hasFloor(world, position) || hasLadder(world, position)) return true
  if (position.y === 0) return false

  if (!isAir(world, { x: position.x, y: position.y - 1 }, cleared)) {
    return true
  }
  return hasFloor(world, { x: position.x, y: position.y - 1 })
}

function isWalkable(
  world: World,
  position: Position,
  cleared?: Position,
): boolean {
  return (
    isInBounds(world, position) &&
    isAir(world, position, cleared) &&
    isSupported(world, position, cleared)
  )
}

export function simulateDigWorld(world: World, target: Position): World {
  const targetIndex = indexFor(target.x, target.y, world.width)
  return {
    ...world,
    cells: world.cells.map((cell, index) =>
      index === targetIndex ? { ...cell, block: 'air' as const } : cell,
    ),
  }
}

export function canMoveBetween(
  world: World,
  from: Position,
  to: Position,
  cleared?: Position,
): boolean {
  if (!isWalkable(world, from, cleared) || !isWalkable(world, to, cleared)) {
    return false
  }
  const vertical = from.x === to.x && from.y !== to.y
  if (!vertical) return true
  return hasLadder(world, from) || hasLadder(world, to)
}

function positionFor(index: number, width: number): Position {
  return { x: index % width, y: Math.floor(index / width) }
}

function createSearchUncached(
  world: World,
  from: Position,
  cleared?: Position,
): SearchResult | null {
  if (!isWalkable(world, from, cleared)) return null

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
      if (!isWalkable(world, next, cleared)) continue
      const vertical = current.x === next.x && current.y !== next.y
      if (vertical && !hasLadder(world, current) && !hasLadder(world, next)) {
        continue
      }

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

function overrideKey(cleared?: Position): string {
  return cleared ? `${cleared.x}:${cleared.y}` : '-'
}

function searchKey(from: Position, cleared?: Position): string {
  return `${from.x}:${from.y}|${overrideKey(cleared)}`
}

function getSearch(
  world: World,
  from: Position,
  cleared?: Position,
): SearchResult | null {
  let cache = searchCache.get(world)
  if (!cache) {
    cache = new Map()
    searchCache.set(world, cache)
  }

  const key = searchKey(from, cleared)
  if (cache.has(key)) return cache.get(key) ?? null

  const search = createSearchUncached(world, from, cleared)
  cache.set(key, search)
  return search
}

function pathKey(from: Position, to: Position, cleared?: Position): string {
  return `${from.x}:${from.y}|${to.x}:${to.y}|${overrideKey(cleared)}`
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
  const search = getSearch(world, from)
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
      if (
        exposed[targetIndex] ||
        !MINEABLE_BLOCK_SET.has(getCell(world, target.x, target.y).block)
      ) {
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
  cleared?: Position,
): Position[] | null {
  let cache = pathCache.get(world)
  if (!cache) {
    cache = new Map()
    pathCache.set(world, cache)
  }

  const key = pathKey(from, to, cleared)
  if (cache.has(key)) return cache.get(key) ?? null

  let path: Position[] | null
  if (from.x === to.x && from.y === to.y) {
    path = isWalkable(world, from, cleared) ? [] : null
  } else if (
    !isWalkable(world, from, cleared) ||
    !isWalkable(world, to, cleared)
  ) {
    path = null
  } else {
    const search = getSearch(world, from, cleared)
    path = search
      ? reconstructPath(search, indexFor(to.x, to.y, world.width), world.width)
      : null
  }

  cache.set(key, path)
  return path
}

export function findAdjacentPaths(
  world: World,
  from: Position,
  target: Position,
  cleared?: Position,
): Array<{ path: Position[]; stand: Position }> {
  return DIRECTIONS.map((direction) => {
    const stand = {
      x: target.x + direction.x,
      y: target.y + direction.y,
    }
    const path = findPath(world, from, stand, cleared)
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

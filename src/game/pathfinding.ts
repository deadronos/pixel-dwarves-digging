import { MINEABLE_BLOCK_SET } from './content'
import { clearCell, getCell } from './generation'
import { isClearedPosition, isInBounds } from './pathfinding/geometry'
import { indexFor, type Position, type World } from './types'

const CARDINAL_DIRECTIONS: Position[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
]

const MOVEMENT_DIRECTIONS: Position[] = [
  ...CARDINAL_DIRECTIONS,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
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

export function createTopologyKey(): object {
  return {}
}

export function getTopologyKey(world: World): object {
  return world.topologyKey ?? world
}

const navigationIndexCache = new WeakMap<object, NavigationIndex>()
const searchCache = new WeakMap<object, Map<string, SearchResult | null>>()
const pathCache = new WeakMap<object, Map<string, Position[] | null>>()

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
  const key = getTopologyKey(world)
  const cached = navigationIndexCache.get(key)
  if (cached) return cached
  const created = createNavigationIndex(world)
  navigationIndexCache.set(key, created)
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

function isAir(world: World, position: Position, cleared?: Position): boolean {
  return isClearedPosition(position, cleared)
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
  return clearCell(world, target)
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

  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) return false

  if (deltaX !== 0 && deltaY !== 0) {
    return (
      isWalkable(world, { x: from.x + deltaX, y: from.y }, cleared) &&
      isWalkable(world, { x: from.x, y: from.y + deltaY }, cleared)
    )
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

    for (const direction of MOVEMENT_DIRECTIONS) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      }
      if (!canMoveBetween(world, current, next, cleared)) continue

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
  const topologyKey = getTopologyKey(world)
  let cache = searchCache.get(topologyKey)
  if (!cache) {
    cache = new Map()
    searchCache.set(topologyKey, cache)
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

    for (const direction of MOVEMENT_DIRECTIONS) {
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
  const topologyKey = getTopologyKey(world)
  let cache = pathCache.get(topologyKey)
  if (!cache) {
    cache = new Map()
    pathCache.set(topologyKey, cache)
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

function findAdjacentPathsForDirections(
  world: World,
  from: Position,
  target: Position,
  directions: Position[],
  cleared?: Position,
): Array<{ path: Position[]; stand: Position }> {
  return directions
    .map((direction) => {
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

export function findAdjacentPaths(
  world: World,
  from: Position,
  target: Position,
  cleared?: Position,
): Array<{ path: Position[]; stand: Position }> {
  return findAdjacentPathsForDirections(
    world,
    from,
    target,
    CARDINAL_DIRECTIONS,
    cleared,
  )
}

export function findAdjacentConstructionPaths(
  world: World,
  from: Position,
  target: Position,
  cleared?: Position,
): Array<{ path: Position[]; stand: Position }> {
  return findAdjacentPathsForDirections(
    world,
    from,
    target,
    MOVEMENT_DIRECTIONS,
    cleared,
  )
}

export function findExposedSolids(world: World, from: Position): Position[] {
  return findReachableExposedSolids(world, from).map(({ target }) => target)
}

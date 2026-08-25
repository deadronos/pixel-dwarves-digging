import { BUILDING_DEFINITIONS } from '../content'
import type { BuildingType, Position, World } from '../types'

type PlacementRequest = {
  type: BuildingType
  position: Position
}

function cellsFor(building: {
  position: Position
  width: number
  height: number
}): Position[] {
  return Array.from(
    { length: building.width * building.height },
    (_, index) => ({
      x: building.position.x + (index % building.width),
      y: building.position.y + Math.floor(index / building.width),
    }),
  )
}

function overlaps(
  first: { position: Position; width: number; height: number },
  second: { position: Position; width: number; height: number },
): boolean {
  return (
    first.position.x < second.position.x + second.width &&
    first.position.x + first.width > second.position.x &&
    first.position.y < second.position.y + second.height &&
    first.position.y + first.height > second.position.y
  )
}

function hasSupport(world: World, position: Position): boolean {
  const below = { x: position.x, y: position.y - 1 }
  if (
    below.x < 0 ||
    below.x >= world.width ||
    below.y < 0 ||
    below.y >= world.height
  ) {
    return false
  }
  const cell = world.cells[below.y * world.width + below.x]
  if (cell.block !== 'air') return true

  return world.buildings.some(
    (building) =>
      building.construction === 'completed' &&
      cellsFor(building).some(
        (occupied) => occupied.x === below.x && occupied.y === below.y,
      ),
  )
}

function hasCompletedBuildingAt(world: World, position: Position): boolean {
  return world.buildings.some(
    (building) =>
      building.construction === 'completed' &&
      building.type !== 'ladder' &&
      position.x >= building.position.x &&
      position.x < building.position.x + building.width &&
      position.y >= building.position.y &&
      position.y < building.position.y + building.height,
  )
}

function hasHorizontalAnchor(world: World, position: Position): boolean {
  return [-1, 1].some((offset) => {
    const neighbor = { x: position.x + offset, y: position.y }
    if (
      neighbor.x < 0 ||
      neighbor.x >= world.width ||
      neighbor.y < 0 ||
      neighbor.y >= world.height
    ) {
      return false
    }
    return (
      world.cells[neighbor.y * world.width + neighbor.x].block !== 'air' ||
      hasCompletedBuildingAt(world, neighbor)
    )
  })
}

function hasLadderAnchor(world: World, position: Position): boolean {
  return [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ].some(({ x: offsetX, y: offsetY }) => {
    const neighbor = {
      x: position.x + offsetX,
      y: position.y + offsetY,
    }
    if (
      neighbor.x < 0 ||
      neighbor.x >= world.width ||
      neighbor.y < 0 ||
      neighbor.y >= world.height
    ) {
      return false
    }
    const cell = world.cells[neighbor.y * world.width + neighbor.x]
    if (cell.block !== 'air') return true
    if (hasCompletedBuildingAt(world, neighbor)) return true
    return (
      offsetX === 0 &&
      world.buildings.some(
        (building) =>
          building.type === 'ladder' &&
          building.construction === 'completed' &&
          cellsFor(building).some(
            (occupied) =>
              occupied.x === neighbor.x && occupied.y === neighbor.y,
          ),
      )
    )
  })
}

export function canPlaceBuilding(
  world: World,
  request: PlacementRequest,
): boolean {
  const definition = BUILDING_DEFINITIONS[request.type]
  const footprint = {
    position: request.position,
    width: definition.width,
    height: definition.height,
  }

  if (
    !cellsFor(footprint).every(
      (cell) =>
        cell.x >= 0 &&
        cell.x < world.width &&
        cell.y >= 0 &&
        cell.y < world.height,
    )
  ) {
    return false
  }

  if (world.buildings.some((building) => overlaps(building, footprint))) {
    return false
  }

  const occupied = new Set(
    world.buildings.flatMap((building) =>
      cellsFor(building).map((cell) => `${cell.x}:${cell.y}`),
    ),
  )
  if (
    cellsFor(footprint).some(
      (cell) =>
        occupied.has(`${cell.x}:${cell.y}`) ||
        world.cells[cell.y * world.width + cell.x].block !== 'air',
    )
  ) {
    return false
  }

  if (request.type === 'bridge') {
    return cellsFor(footprint).every((cell) => hasHorizontalAnchor(world, cell))
  }
  if (request.type === 'ladder') {
    return cellsFor(footprint).every((cell) => hasLadderAnchor(world, cell))
  }

  const bottomRow = cellsFor(footprint).filter(
    (cell) => cell.y === footprint.position.y,
  )
  return bottomRow.every((cell) => hasSupport(world, cell))
}

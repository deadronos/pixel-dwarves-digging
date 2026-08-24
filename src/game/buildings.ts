import { BUILDING_DEFINITIONS, getEmergencyReserveMaterial } from './content'
import type {
  BuildingState,
  BuildingType,
  ConstructionOrder,
  Inventory,
  Position,
  SimulationState,
  World,
} from './types'

type PlacementRequest = {
  type: BuildingType
  position: Position
}

function isInBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && x < world.width && y >= 0 && y < world.height
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
  if (!isInBounds(world, below.x, below.y)) return false
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
    if (!isInBounds(world, neighbor.x, neighbor.y)) return false
    return (
      world.cells[neighbor.y * world.width + neighbor.x].block !== 'air' ||
      hasCompletedBuildingAt(world, neighbor)
    )
  })
}

function hasLadderAnchor(world: World, position: Position): boolean {
  return [-1, 1].some((offset) => {
    const neighbor = { x: position.x + offset, y: position.y }
    if (!isInBounds(world, neighbor.x, neighbor.y)) return false
    return (
      world.cells[neighbor.y * world.width + neighbor.x].block !== 'air' ||
      hasCompletedBuildingAt(world, neighbor)
    )
  })
}

export function getPrimaryStockpile(world: World): BuildingState | null {
  return (
    world.buildings.find(
      (building) =>
        building.type === 'stockpile' && building.construction === 'completed',
    ) ?? null
  )
}

export function getStorageBuilding(
  world: World,
  buildingId: string,
): BuildingState | null {
  return (
    world.buildings.find(
      (building) =>
        building.id === buildingId &&
        building.construction === 'completed' &&
        building.storage,
    ) ?? null
  )
}

export function getStorageCapacity(world: World, buildingId: string): number {
  return getStorageBuilding(world, buildingId)?.storage?.capacity ?? 0
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

  if (!cellsFor(footprint).every((cell) => isInBounds(world, cell.x, cell.y))) {
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

function updateOrder(
  state: SimulationState,
  orderId: string,
  update: (order: ConstructionOrder) => ConstructionOrder,
): SimulationState {
  return {
    ...state,
    constructionOrders: state.constructionOrders.map((order) =>
      order.id === orderId ? update(order) : order,
    ),
  }
}

function removeFromStorage(
  world: World,
  material: keyof Inventory,
  amount: number,
): World {
  let remaining = amount
  return {
    ...world,
    buildings: world.buildings.map((building) => {
      if (!building.storage || remaining <= 0) return building
      const stored = building.storage.inventory[material] ?? 0
      const removed = Math.min(stored, remaining)
      remaining -= removed
      return {
        ...building,
        storage: {
          ...building.storage,
          inventory: {
            ...building.storage.inventory,
            [material]: stored - removed,
          },
        },
      }
    }),
  }
}

export function returnMaterialToStorage(
  world: World,
  material: keyof Inventory,
): { world: World; stored: boolean } {
  const destination = world.buildings.find(
    (building) =>
      building.construction === 'completed' &&
      building.storage &&
      Object.values(building.storage.inventory).reduce(
        (total, amount) => total + (amount ?? 0),
        0,
      ) < building.storage.capacity,
  )
  if (!destination?.storage) return { world, stored: false }

  return {
    world: {
      ...world,
      buildings: world.buildings.map((building) =>
        building.id === destination.id && building.storage
          ? {
              ...building,
              storage: {
                ...building.storage,
                inventory: {
                  ...building.storage.inventory,
                  [material]: (building.storage.inventory[material] ?? 0) + 1,
                },
              },
            }
          : building,
      ),
    },
    stored: true,
  }
}

export function reserveConstructionMaterials(
  state: SimulationState,
  orderId: string,
): SimulationState {
  const order = state.constructionOrders.find(({ id }) => id === orderId)
  if (!order) return state
  const building = state.world.buildings.find(
    ({ id }) => id === order.buildingId,
  )
  if (!building || building.construction === 'completed') return state

  const inventory = { ...state.inventory }
  const reserved = { ...order.reserved }
  let world = state.world
  for (const [material, amount] of Object.entries(order.required)) {
    const key = material as keyof typeof inventory
    const reserveMaterial = getEmergencyReserveMaterial(state.inventory)
    const reserve = key === reserveMaterial ? state.safety.emergencyStone : 0
    const available = Math.max(0, inventory[key] - reserve)
    const needed = Math.max(0, (amount ?? 0) - (reserved[key] ?? 0))
    const taken = Math.min(available, needed)
    inventory[key] -= taken
    world = removeFromStorage(world, key, taken)
    reserved[key] = (reserved[key] ?? 0) + taken
  }

  return updateOrder({ ...state, world, inventory }, orderId, (current) => ({
    ...current,
    reserved,
  }))
}

export function completeConstruction(
  state: SimulationState,
  orderId: string,
): SimulationState {
  const order = state.constructionOrders.find(({ id }) => id === orderId)
  if (!order) return state

  const building = state.world.buildings.find(
    ({ id }) => id === order.buildingId,
  )
  if (!building) return state

  if (!canCompleteConstruction(state.world, order.buildingId)) return state

  const materialsComplete = Object.entries(order.required).every(
    ([material, required]) =>
      (order.delivered[material as keyof Inventory] ?? 0) >= (required ?? 0),
  )
  if (!materialsComplete) return state

  const definition = BUILDING_DEFINITIONS[order.type]
  const completedBuilding: BuildingState = {
    ...building,
    construction: 'completed',
    storage:
      'capacity' in definition
        ? {
            capacity: definition.capacity,
            inventory: {},
          }
        : building.storage,
  }

  return {
    ...state,
    world: {
      ...state.world,
      buildings: state.world.buildings.map((candidate) =>
        candidate.id === completedBuilding.id ? completedBuilding : candidate,
      ),
    },
    constructionOrders: state.constructionOrders.filter(
      ({ id }) => id !== orderId,
    ),
  }
}

export function canCompleteConstruction(
  world: World,
  buildingId: string,
): boolean {
  const building = world.buildings.find(({ id }) => id === buildingId)
  if (!building || building.construction === 'completed') return false

  const placementWorld = {
    ...world,
    buildings: world.buildings.filter(({ id }) => id !== buildingId),
  }
  return canPlaceBuilding(placementWorld, {
    type: building.type,
    position: building.position,
  })
}

import { canPlaceBuilding } from './buildings/placement'
import {
  getBuildingById,
  getCompletedBuildingByType,
} from './buildings/selectors'
import {
  addMaterialToStorage,
  findStorageWithCapacity,
  removeFromStorage,
} from './buildings/storage'
import {
  BUILDING_DEFINITIONS,
  getEmergencyReserveMaterial,
  STORAGE_UPGRADE_CAPACITY_BONUS,
} from './content'
import type {
  BuildingState,
  ConstructionOrder,
  Inventory,
  MineableBlockType,
  SimulationState,
  World,
} from './types'

export function getPrimaryStockpile(world: World): BuildingState | null {
  return getCompletedBuildingByType(world, 'stockpile')
}

export function getStorageBuilding(
  world: World,
  buildingId: string,
): BuildingState | null {
  const building = getBuildingById(world, buildingId)
  return building?.construction === 'completed' && building.storage
    ? building
    : null
}

export function getStorageCapacity(world: World, buildingId: string): number {
  return getStorageBuilding(world, buildingId)?.storage?.capacity ?? 0
}

export { canPlaceBuilding }

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

export function returnMaterialToStorage(
  world: World,
  material: keyof Inventory,
): { world: World; stored: boolean } {
  const destination = findStorageWithCapacity(world)
  if (!destination) return { world, stored: false }
  const storedWorld = addMaterialToStorage(
    world,
    destination.id,
    material as MineableBlockType,
  )
  return storedWorld
    ? { world: storedWorld, stored: true }
    : { world, stored: false }
}

export function reserveConstructionMaterials(
  state: SimulationState,
  orderId: string,
): SimulationState {
  const order = state.constructionOrders.find(({ id }) => id === orderId)
  if (!order) return state
  const building = getBuildingById(state.world, order.buildingId)
  if (
    !building ||
    (building.construction === 'completed' &&
      order.reason !== 'storage-upgrade')
  ) {
    return state
  }

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

export function consumeConstructionMaterial(
  state: SimulationState,
  material: keyof Inventory,
  amount: number,
): SimulationState | null {
  if (amount < 0 || state.inventory[material] < amount) return null

  return {
    ...state,
    world: removeFromStorage(state.world, material, amount),
    inventory: {
      ...state.inventory,
      [material]: state.inventory[material] - amount,
    },
  }
}

export function completeConstruction(
  state: SimulationState,
  orderId: string,
): SimulationState {
  const order = state.constructionOrders.find(({ id }) => id === orderId)
  if (!order) return state

  const building = getBuildingById(state.world, order.buildingId)
  if (!building) return state

  if (
    !canCompleteConstruction(
      state.world,
      order.buildingId,
      order.reason === 'storage-upgrade',
    )
  ) {
    return state
  }

  const materialsComplete = Object.entries(order.required).every(
    ([material, required]) =>
      (order.delivered[material as keyof Inventory] ?? 0) >= (required ?? 0),
  )
  if (!materialsComplete) return state

  if (order.reason === 'storage-upgrade') {
    if (!building.storage || order.targetLevel !== building.level + 1) {
      return state
    }
    const storage = building.storage

    return {
      ...state,
      world: {
        ...state.world,
        buildings: state.world.buildings.map((candidate) =>
          candidate.id === building.id
            ? {
                ...candidate,
                level: order.targetLevel ?? candidate.level,
                storage: {
                  ...storage,
                  capacity: storage.capacity + STORAGE_UPGRADE_CAPACITY_BONUS,
                },
              }
            : candidate,
        ),
      },
      constructionOrders: state.constructionOrders.filter(
        ({ id }) => id !== orderId,
      ),
    }
  }

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
  allowStorageUpgrade = false,
): boolean {
  const building = getBuildingById(world, buildingId)
  if (!building) return false
  if (building.construction === 'completed') {
    return allowStorageUpgrade && building.storage !== undefined
  }

  const placementWorld = {
    ...world,
    buildings: world.buildings.filter(({ id }) => id !== buildingId),
  }
  return canPlaceBuilding(placementWorld, {
    type: building.type,
    position: building.position,
  })
}

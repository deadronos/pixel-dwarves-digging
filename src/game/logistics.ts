import {
  canPlaceBuilding,
  getPrimaryStockpile,
  returnMaterialToStorage,
} from './buildings'
import {
  BUILDING_DEFINITIONS,
  COMMON_BUILDING_MATERIALS,
  getEmergencyReserveMaterial,
  MAX_DEPOTS_PER_STOCKPILE,
  MAX_STORAGE_LEVEL,
  OVERFLOW_DEPOT_TRIGGER_CAPACITY,
  STARTER_PROTECTED_RADIUS,
  STORAGE_UPGRADE_COST,
} from './content'
import {
  findAdjacentConstructionPaths,
  findPath,
  isSupported,
  simulateDigWorld,
} from './pathfinding'
import {
  type AccessFailure,
  type AccessRequest,
  type BuildingState,
  type BuildingType,
  type CommonBuildingMaterial,
  type ConstructionOrder,
  cloneInventory,
  type Inventory,
  type MineableBlockType,
  type Position,
  type SimulationState,
  type World,
} from './types'

import {
  chooseCommonConstructionMaterial,
  canPlanAdditionalDepot,
  depositCarriedMaterial,
  getAggregateInventory,
  getAvailableCapacity,
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  getDepotLimit,
  getReservedStorageCapacity,
  hasActiveBuilder,
  hasReachableBuilder,
  hasReachableConstructionSite,
  hasReachableStorage,
  selectStorageDestination,
  storageBuildings,
  storagePerimeterCandidates,
  storedCount,
  type StorageDestination,
} from './logistics/storage'
import {
  findEmergencyLadderPlan,
  planAccessConstructionOrder,
  type EmergencyLadderPlan,
} from './logistics/access'
import { assessDigSafety, type DigSafety } from './logistics/safety'

export type { StorageDestination } from './logistics/storage'
export type { EmergencyLadderPlan } from './logistics/access'
export type { DigSafety } from './logistics/safety'
export type {
  StorageDiagnostics,
  StorageExpansionDiagnostic,
} from './logistics/expansion'
export {
  chooseCommonConstructionMaterial,
  depositCarriedMaterial,
  getAggregateInventory,
  getAvailableCapacity,
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  getDepotLimit,
  hasReachableStorage,
  selectStorageDestination,
} from './logistics/storage'
export { findEmergencyLadderPlan, planAccessConstructionOrder } from './logistics/access'
export { assessDigSafety } from './logistics/safety'
export {
  getStorageDiagnostics,
  getStorageExpansionDiagnostics,
  planEmergencyCapacityOrder,
  planExpansionOrder,
  planOverflowDepotOrder,
  planStorageUpgradeOrder,
} from './logistics/expansion'

export function isBootstrapActive(state: SimulationState): boolean {
  return state.safety.phase === 'bootstrap'
}

export function isBootstrapProtectedTarget(
  state: SimulationState,
  target: Position,
): boolean {
  if (!isBootstrapActive(state)) return false

  const start = state.world.start
  const stockpile = getPrimaryStockpile(state.world)
  const underStarterPocket =
    target.y < start.y &&
    Math.abs(target.x - start.x) <= STARTER_PROTECTED_RADIUS
  const underStockpile =
    stockpile !== null &&
    target.y === stockpile.position.y - 1 &&
    target.x >= stockpile.position.x &&
    target.x < stockpile.position.x + stockpile.width

  return underStarterPocket || underStockpile
}

function returnOrderMaterials(
  state: SimulationState,
  order: ConstructionOrder,
): SimulationState | null {
  let next = state
  for (const material of Object.keys(order.required) as Array<
    keyof Inventory
  >) {
    const amount =
      (order.reserved[material] ?? 0) + (order.delivered[material] ?? 0)
    for (let count = 0; count < amount; count += 1) {
      const returned = returnMaterialToStorage(next.world, material)
      if (!returned.stored) return null
      next = {
        ...next,
        world: returned.world,
        inventory: {
          ...next.inventory,
          [material]: next.inventory[material] + 1,
        },
      }
    }
  }
  return next
}

function recoverAccessOrders(
  state: SimulationState,
  recoverUnreachable: boolean,
): SimulationState {
  let next = state
  for (const order of state.constructionOrders) {
    if (order.reason !== 'access') continue

    const request = next.accessRequests.find(
      (candidate) => candidate.id === order.accessRequestId,
    )
    const building = next.world.buildings.find(
      (candidate) => candidate.id === order.buildingId,
    )
    const orphaned =
      order.accessRequestId === undefined || request === undefined
    const unreachable =
      recoverUnreachable &&
      building?.construction === 'planned' &&
      !hasActiveBuilder(next, building.id) &&
      !hasReachableBuilder(next, building.position)

    if (!orphaned && !unreachable) continue
    if (building && hasActiveBuilder(next, building.id)) continue
    if (
      building?.construction !== undefined &&
      building.construction !== 'planned'
    ) {
      continue
    }

    const returned = returnOrderMaterials(next, order)
    if (!returned) continue
    next = {
      ...returned,
      world: {
        ...returned.world,
        buildings: building
          ? returned.world.buildings.filter(
              (candidate) => candidate.id !== building.id,
            )
          : returned.world.buildings,
      },
      constructionOrders: returned.constructionOrders.filter(
        (candidate) => candidate.id !== order.id,
      ),
    }
  }
  return next
}

export function recoverOrphanedAccessOrders(
  state: SimulationState,
): SimulationState {
  return recoverAccessOrders(state, false)
}

export function recoverStaleAccessOrders(
  state: SimulationState,
): SimulationState {
  return recoverAccessOrders(state, true)
}

export function recoverStaleOutpostOrders(
  state: SimulationState,
): SimulationState {
  let next = state
  for (const order of state.constructionOrders) {
    if (order.reason !== 'outpost') continue
    const building = next.world.buildings.find(
      (candidate) => candidate.id === order.buildingId,
    )
    if (
      building?.construction !== 'planned' ||
      hasActiveBuilder(next, building.id) ||
      hasReachableConstructionSite(next, building.position)
    ) {
      continue
    }

    const returned = returnOrderMaterials(next, order)
    if (!returned) continue
    next = {
      ...returned,
      world: {
        ...returned.world,
        buildings: returned.world.buildings.filter(
          (candidate) => candidate.id !== building.id,
        ),
      },
      constructionOrders: returned.constructionOrders.filter(
        (candidate) => candidate.id !== order.id,
      ),
    }
  }
  return next
}

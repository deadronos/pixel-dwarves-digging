import { getPrimaryStockpile } from './buildings'
import { STARTER_PROTECTED_RADIUS } from './content'
import type { Position, SimulationState } from './types'

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
export {
  findEmergencyLadderPlan,
  planAccessConstructionOrder,
  recoverOrphanedAccessOrders,
  recoverStaleAccessOrders,
  recoverStaleOutpostOrders,
} from './logistics/access'
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

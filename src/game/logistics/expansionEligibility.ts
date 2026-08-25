import type { SimulationState } from '../types'
import {
  getAvailableCapacity,
  getAvailableConstructionMaterial,
} from './storage'

export type ExpansionEligibility = {
  availableCapacity: number
  availableStone: number
  hasPendingCapacityOrder: boolean
  hasPendingOutpostOrder: boolean
  hasPendingStorageUpgrade: boolean
  hasPendingDepot: boolean
}

export function getExpansionEligibility(
  state: SimulationState,
): ExpansionEligibility {
  const orders = state.constructionOrders
  return {
    availableCapacity: getAvailableCapacity(state.world),
    availableStone: getAvailableConstructionMaterial(state, 'stone'),
    hasPendingCapacityOrder: orders.some(
      (order) => order.reason === 'capacity',
    ),
    hasPendingOutpostOrder: orders.some((order) => order.type === 'outpost'),
    hasPendingStorageUpgrade: orders.some(
      (order) => order.reason === 'storage-upgrade',
    ),
    hasPendingDepot: orders.some((order) => order.type === 'depot'),
  }
}

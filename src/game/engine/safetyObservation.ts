import { NO_PROGRESS_TICK_LIMIT } from '../content'
import { hasMineableSolids } from '../generation'
import {
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  hasReachableStorage,
} from '../logistics'
import type { Inventory, SimulationState } from '../types'
import { chooseTarget, findUnsafeTarget } from './targeting'
import { chooseBuildOrder } from './tasks'

export type SafetyObservation = {
  hasSafeWork: boolean
  hasBuildWork: boolean
  hasWaitingAccess: boolean
  hasRecovery: boolean
  hasRecoveryProgress: boolean
  hasStalledRecovery: boolean
  hasActiveWork: boolean
  hasUnroutableAccess: boolean
  storageCapacityExhausted: boolean
  storageRouteUnavailable: boolean
  hasStorageBlockedWork: boolean
  hasMineableSolids: boolean
  hasWaitingConstructionMaterial: boolean
}

export function deriveSafetyObservation(
  state: SimulationState,
): SafetyObservation {
  const hasSafeWork = state.dwarves.some(
    (dwarf) =>
      dwarf.task.kind === 'idle' && chooseTarget(state, dwarf) !== null,
  )
  const hasBuildWork = state.dwarves.some(
    (dwarf) =>
      dwarf.task.kind === 'idle' && chooseBuildOrder(state, dwarf) !== null,
  )
  const hasWaitingAccess = state.accessRequests.some(
    (request) =>
      request.status === 'open' &&
      (request.blockedReason === 'waiting-for-stone' ||
        request.blockedReason === 'waiting-for-material'),
  )
  const hasRecovery = state.dwarves.some(
    (dwarf) =>
      dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded',
  )
  const hasRecoveryProgress = state.dwarves.some(
    (dwarf) => dwarf.task.purpose === 'recovery' && dwarf.task.path.length > 0,
  )
  const hasStalledRecovery = state.dwarves.some(
    (dwarf) =>
      (dwarf.noProgressTicks ?? 0) >= NO_PROGRESS_TICK_LIMIT &&
      (dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded'),
  )
  const hasActiveWork = state.dwarves.some(
    (dwarf) => dwarf.task.kind !== 'idle' || dwarf.carrying !== null,
  )
  const hasUnroutableAccess = state.accessRequests.some(
    (request) =>
      request.status === 'open' && request.blockedReason === 'no-builder-route',
  )
  const storageCapacityExhausted = getAvailableStateCapacity(state) === 0
  const storageRouteUnavailable = !hasReachableStorage(state)
  const hasStorageBlockedWork =
    !hasSafeWork &&
    (state.dwarves.some(
      (dwarf) =>
        dwarf.task.kind === 'idle' &&
        findUnsafeTarget(state, dwarf)?.failure === 'storage-route',
    ) ||
      (storageCapacityExhausted && storageRouteUnavailable))
  const hasMineableSolidsInWorld = hasMineableSolids(state.world)
  const hasWaitingConstructionMaterial = state.constructionOrders.some(
    (order) => {
      const pending = (
        Object.keys(order.required) as Array<keyof Inventory>
      ).filter(
        (material) =>
          (order.delivered[material] ?? 0) < (order.required[material] ?? 0),
      )
      return (
        pending.length > 0 &&
        pending.every(
          (material) => getAvailableConstructionMaterial(state, material) === 0,
        )
      )
    },
  )

  return {
    hasSafeWork,
    hasBuildWork,
    hasWaitingAccess,
    hasRecovery,
    hasRecoveryProgress,
    hasStalledRecovery,
    hasActiveWork,
    hasUnroutableAccess,
    storageCapacityExhausted,
    storageRouteUnavailable,
    hasStorageBlockedWork,
    hasMineableSolids: hasMineableSolidsInWorld,
    hasWaitingConstructionMaterial,
  }
}

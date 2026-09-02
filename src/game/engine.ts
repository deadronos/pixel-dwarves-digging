import {
  BOOTSTRAP_NO_PROGRESS_TICK_LIMIT,
  COMMON_BUILDING_MATERIALS,
  NO_PROGRESS_TICK_LIMIT,
  STARTER_BOOTSTRAP_CLEAR_COUNT,
} from './content'
import {
  planAccessRequests,
  reopenResolvedAccessRequests,
} from './engine/accessRequests'
import { advanceDwarf } from './engine/advancement'
import { settleDwarf } from './engine/recovery'
import { deriveSafetyObservation } from './engine/safetyObservation'
import { createTargetPlanningContext } from './engine/targeting'
import { hasMineableSolids } from './generation'
import {
  getAvailableConstructionMaterial,
  planEmergencyCapacityOrder,
  planExpansionOrder,
  planOverflowDepotOrder,
  planStorageUpgradeOrder,
  recoverStaleAccessOrders,
  recoverStaleOutpostOrders,
} from './logistics'
import { cloneInventory, type SimulationState } from './types'

function updateSafetyState(state: SimulationState): SimulationState['safety'] {
  const {
    hasSafeWork,
    hasBuildWork,
    hasWaitingAccess,
    hasRecovery,
    hasRecoveryProgress,
    hasStalledRecovery,
    hasActiveWork,
    hasUnroutableAccess,
    storageCapacityExhausted,
    hasStorageBlockedWork,
    hasMineableSolids,
    hasWaitingConstructionMaterial,
  } = deriveSafetyObservation(state)
  const noProgressTicks = state.safety.noProgressTicks ?? 0
  const bootstrapActive =
    state.safety.phase === 'bootstrap' &&
    state.totalCleared < STARTER_BOOTSTRAP_CLEAR_COUNT
  const stalled =
    noProgressTicks >=
    (bootstrapActive
      ? BOOTSTRAP_NO_PROGRESS_TICK_LIMIT
      : NO_PROGRESS_TICK_LIMIT)
  const blocked = (
    blockedReason: NonNullable<SimulationState['safety']['blockedReason']>,
  ): SimulationState['safety'] => ({
    phase: 'blocked',
    emergencyStone: state.safety.emergencyStone,
    blockedReason,
    noProgressTicks,
  })

  if (hasStalledRecovery && !hasRecoveryProgress) {
    return blocked('awaiting-recovery')
  }

  if (
    !hasSafeWork &&
    !hasBuildWork &&
    !hasActiveWork &&
    hasWaitingAccess &&
    COMMON_BUILDING_MATERIALS.every(
      (material) => getAvailableConstructionMaterial(state, material) === 0,
    )
  ) {
    return blocked('waiting-for-stone')
  }

  if (
    !hasSafeWork &&
    !hasBuildWork &&
    !hasActiveWork &&
    hasWaitingConstructionMaterial
  ) {
    return blocked('waiting-for-material')
  }

  if (
    hasRecovery &&
    !hasSafeWork &&
    !hasBuildWork &&
    !hasRecoveryProgress &&
    (!hasActiveWork || stalled)
  ) {
    return blocked('awaiting-recovery')
  }

  if (
    hasStorageBlockedWork &&
    !hasBuildWork &&
    !hasRecovery &&
    !hasActiveWork
  ) {
    return blocked(storageCapacityExhausted ? 'storage-full' : 'no-safe-work')
  }

  if (hasUnroutableAccess && !hasSafeWork && !hasBuildWork && !hasActiveWork) {
    return blocked('no-safe-work')
  }

  if (hasMineableSolids && !hasSafeWork && !hasBuildWork && stalled) {
    return blocked(
      hasStorageBlockedWork && storageCapacityExhausted
        ? 'storage-full'
        : 'no-safe-work',
    )
  }

  if (bootstrapActive) {
    return {
      phase: 'bootstrap',
      emergencyStone: state.safety.emergencyStone,
      noProgressTicks,
    }
  }

  return {
    phase: 'operational',
    emergencyStone: state.safety.emergencyStone,
    noProgressTicks,
  }
}

function stepOnce(state: SimulationState): SimulationState {
  if (state.completed) return { ...state, tick: state.tick + 1 }

  const recoveredState = recoverStaleAccessOrders(
    recoverStaleOutpostOrders(state),
  )
  const targetPlanningContext = createTargetPlanningContext(recoveredState)
  const requestedState =
    state.safety.phase === 'blocked'
      ? planAccessRequests(
          reopenResolvedAccessRequests(recoveredState, targetPlanningContext),
          targetPlanningContext,
        )
      : planAccessRequests(recoveredState, targetPlanningContext)
  const capacityState = planOverflowDepotOrder(requestedState)
  const upgradedState = planStorageUpgradeOrder(capacityState)
  const plannedState =
    state.safety.phase === 'blocked'
      ? planEmergencyCapacityOrder(upgradedState)
      : planExpansionOrder(upgradedState)

  const nextState: SimulationState = {
    ...plannedState,
    tick: plannedState.tick + 1,
    inventory: cloneInventory(plannedState.inventory),
    dwarves: plannedState.dwarves.slice(),
  }

  let progressedThisTick = false
  for (let index = 0; index < state.dwarves.length; index += 1) {
    const previousDwarf = nextState.dwarves[index]
    const settled = settleDwarf(nextState.world, nextState.dwarves[index])
    nextState.dwarves[index] = settled
    const worldBeforeAdvance = nextState.world
    const advanced = advanceDwarf(nextState, settled, targetPlanningContext)
    const worldChanged =
      advanced.world.cells !== worldBeforeAdvance.cells ||
      advanced.world.buildings !== worldBeforeAdvance.buildings
    nextState.dwarves[index] = {
      ...advanced.dwarf,
      noProgressTicks:
        advanced.progressed || worldChanged
          ? 0
          : (previousDwarf.noProgressTicks ?? 0) + 1,
    }
    nextState.world = advanced.world
    if (worldChanged) {
      nextState.worldRevision += 1
      progressedThisTick = true
    }
    if (advanced.progressed) progressedThisTick = true
    if (advanced.inventory) nextState.inventory = advanced.inventory
    if (advanced.safety) nextState.safety = advanced.safety
    if (advanced.constructionOrders) {
      nextState.constructionOrders = advanced.constructionOrders
    }

    if (advanced.minedBlock) {
      nextState.totalCleared += 1
      if (advanced.minedBlock === 'relic') nextState.discoveredRelics += 1
    }
    if (advanced.depositedBlock) {
      nextState.inventory[advanced.depositedBlock] += 1
    }
  }

  const hasSolids = hasMineableSolids(nextState.world)
  const allDwarvesSettled = nextState.dwarves.every(
    (dwarf) => dwarf.task.kind === 'idle' && dwarf.carrying === null,
  )
  const hasPendingPlans =
    nextState.constructionOrders.length > 0 ||
    nextState.accessRequests.some((request) => request.status === 'open')
  const safetyState: SimulationState = {
    ...nextState,
    safety: {
      ...nextState.safety,
      noProgressTicks: progressedThisTick
        ? 0
        : (state.safety.noProgressTicks ?? 0) + 1,
    },
  }
  return {
    ...safetyState,
    safety: updateSafetyState(safetyState),
    completed: !hasSolids && allDwarvesSettled && !hasPendingPlans,
  }
}

export function stepSimulation(
  state: SimulationState,
  ticks = 1,
): SimulationState {
  let current = state
  for (let index = 0; index < ticks; index += 1) {
    current = stepOnce(current)
  }
  return current
}

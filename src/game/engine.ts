import { planAccessRequests } from './engine/accessRequests'
import { advanceDwarf } from './engine/advancement'
import { planFrontierRecovery } from './engine/frontierRecovery'
import { settleDwarf } from './engine/recovery'
import { deriveSafetyObservation } from './engine/safetyObservation'
import { transitionSafety } from './engine/safetyState'
import { createTargetPlanningContext } from './engine/targeting'
import { releaseBuildReservation } from './engine/tasks'
import {
  planStorageConstruction,
  recoverStaleAccessOrders,
  recoverStaleStorageOrders,
} from './logistics'
import { advanceFreight } from './logistics/freight'
import { dispatchSurplus } from './logistics/shipments'
import { advanceWorkshop } from './logistics/workshop'
import { cloneInventory, type SimulationState } from './types'

function stepOnce(state: SimulationState): SimulationState {
  if (state.completed) return { ...state, tick: state.tick + 1 }

  const suppliedState = advanceFreight(advanceWorkshop(dispatchSurplus(state)))
  const recoveredState = recoverStaleAccessOrders(
    recoverStaleStorageOrders(suppliedState),
  )
  const targetPlanningContext = createTargetPlanningContext(recoveredState)
  const requestedState = planAccessRequests(
    recoveredState,
    targetPlanningContext,
  )
  const plannedState = planStorageConstruction(requestedState)

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
    if (previousDwarf.task.kind === 'build' && settled.task.kind !== 'build') {
      nextState.constructionOrders = releaseBuildReservation(
        nextState.constructionOrders,
        previousDwarf,
      )
    }
    nextState.dwarves[index] = settled
    const worldBeforeAdvance = nextState.world
    const advanced = advanceDwarf(nextState, settled, targetPlanningContext)
    const worldChanged =
      advanced.world.cells !== worldBeforeAdvance.cells ||
      advanced.world.buildings !== worldBeforeAdvance.buildings
    nextState.dwarves[index] = {
      ...advanced.dwarf,
      noProgressTicks: advanced.progressed
        ? 0
        : (previousDwarf.noProgressTicks ?? 0) + 1,
    }
    nextState.world = advanced.world
    if (worldChanged) {
      nextState.worldRevision += 1
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
      nextState.inventory[advanced.depositedBlock] +=
        advanced.depositedCount ?? 1
    }
  }

  const observation = deriveSafetyObservation(nextState)
  const allDwarvesSettled = nextState.dwarves.every(
    (dwarf) => dwarf.task.kind === 'idle' && dwarf.carrying === null,
  )
  const hasPendingPlans =
    nextState.constructionOrders.length > 0 ||
    nextState.accessRequests.some((request) => request.status === 'open')
  const noProgressTicks = progressedThisTick
    ? 0
    : (state.safety.noProgressTicks ?? 0) + 1
  return planFrontierRecovery({
    ...nextState,
    safety: transitionSafety(
      { ...nextState.safety, noProgressTicks },
      nextState.totalCleared,
      observation,
    ),
    completed:
      !observation.hasMineableSolids && allDwarvesSettled && !hasPendingPlans,
  })
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

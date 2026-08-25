import {
  canCompleteConstruction,
  completeConstruction,
  consumeConstructionMaterial,
  reserveConstructionMaterials,
  returnMaterialToStorage,
} from './buildings'
import {
  BOOTSTRAP_NO_PROGRESS_TICK_LIMIT,
  COMMON_BUILDING_MATERIALS,
  DIG_DURATION,
  getEmergencyReserveMaterial,
  MAX_OPEN_ACCESS_REQUESTS,
  MINEABLE_BLOCK_SET,
  MINERAL_BLOCKS,
  NO_PROGRESS_TICK_LIMIT,
  STARTER_BOOTSTRAP_CLEAR_COUNT,
} from './content'
import { getCell } from './generation'
import {
  assessDigSafety,
  chooseCommonConstructionMaterial,
  depositCarriedMaterial,
  findEmergencyLadderPlan,
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  hasReachableStorage,
  isBootstrapProtectedTarget,
  planAccessConstructionOrder,
  planEmergencyCapacityOrder,
  planExpansionOrder,
  planOverflowDepotOrder,
  planStorageUpgradeOrder,
  recoverOrphanedAccessOrders,
  recoverStaleAccessOrders,
  recoverStaleOutpostOrders,
  selectStorageDestination,
} from './logistics'
import {
  chooseAccessTarget,
  chooseTarget,
  findUnsafeTarget,
} from './engine/targeting'
import {
  planAccessRequests,
  reopenResolvedAccessRequests,
} from './engine/accessRequests'
import {
  attemptEmergencyRecovery,
  recoveryTask,
  settleDwarf,
  type AdvanceResult,
} from './engine/recovery'
import {
  chooseBuildOrder,
  clearCell,
  invalidateTask,
  samePosition,
  unchanged,
  validPath,
} from './engine/tasks'
import {
  canMoveBetween,
  findAdjacentConstructionPaths,
  findAdjacentPaths,
  findPath,
  findReachableExposedSolids,
  isSupported,
  type ReachableExposedSolid,
} from './pathfinding'
import {
  type AccessRequest,
  type ConstructionOrder,
  cloneInventory,
  type DwarfState,
  type Inventory,
  indexFor,
  type MineableBlockType,
  type Position,
  type SimulationState,
  type World,
} from './types'

function updateSafetyState(state: SimulationState): SimulationState['safety'] {
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
  const hasMineableSolids = state.world.cells.some((cell) =>
    MINEABLE_BLOCK_SET.has(cell.block),
  )
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

function advanceDwarf(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  if (dwarf.movement === 'falling') {
    return unchanged(dwarf, state.world)
  }
  if (dwarf.movement === 'stranded') {
    return (
      attemptEmergencyRecovery(state, dwarf) ?? unchanged(dwarf, state.world)
    )
  }

  const task = dwarf.task
  if (
    task.kind === 'idle' &&
    task.purpose === 'recovery' &&
    task.recoveryReason === 'stranded'
  ) {
    const recovery = attemptEmergencyRecovery(state, dwarf)
    if (recovery) return recovery
  }

  if (task.kind === 'idle') {
    if (dwarf.carrying) {
      const destination = selectStorageDestination(
        state,
        dwarf.carrying,
        dwarf.position,
        dwarf.id,
      )
      const path = destination
        ? findPath(state.world, dwarf.position, destination.position)
        : null
      if (destination && path) {
        const result = unchanged(
          {
            ...dwarf,
            task: {
              kind: 'haul',
              target: destination.position,
              path,
              progress: 0,
              block: dwarf.carrying,
              buildingId: destination.id,
              purpose: 'recovery',
              recoveryReason: 'storage-route',
            },
          },
          state.world,
        )
        return result
      }
      return (
        attemptEmergencyRecovery(state, dwarf) ??
        unchanged(
          { ...dwarf, task: recoveryTask(dwarf, 'storage-route') },
          state.world,
        )
      )
    }

    const buildOrder = chooseBuildOrder(state, dwarf)
    if (buildOrder) {
      const order = state.constructionOrders.find(
        ({ id }) => id === buildOrder.orderId,
      )
      return {
        dwarf: {
          ...dwarf,
          carrying: buildOrder.material,
          task: {
            kind: 'build',
            target: buildOrder.stand,
            path: buildOrder.path,
            progress: 0,
            block: buildOrder.material,
            buildingId: order?.buildingId,
            constructionOrderId: buildOrder.orderId,
            purpose: order?.reason === 'access' ? 'access' : 'ordinary',
          },
        },
        world: state.world,
        minedBlock: null,
      }
    }

    const ordersNeedingMaterials = state.constructionOrders
      .filter((order) => {
        const building = state.world.buildings.find(
          ({ id }) => id === order.buildingId,
        )
        return (
          building !== undefined &&
          (building.construction !== 'completed' ||
            order.reason === 'storage-upgrade') &&
          Object.keys(order.required).some((material) => {
            const key = material as keyof Inventory
            const required = order.required[key] ?? 0
            const delivered = order.delivered[key] ?? 0
            const reserved = order.reserved[key] ?? 0
            return delivered < required && reserved < required - delivered
          })
        )
      })
      .sort((first, second) => {
        const rank = (reason: ConstructionOrder['reason']) =>
          reason === 'access'
            ? 0
            : reason === 'capacity' || reason === 'storage-upgrade'
              ? 1
              : 2
        return rank(first.reason) - rank(second.reason)
      })
    for (const orderNeedingMaterials of ordersNeedingMaterials) {
      const reservedState = reserveConstructionMaterials(
        state,
        orderNeedingMaterials.id,
      )
      const reservedBuild = chooseBuildOrder(
        reservedState,
        dwarf,
        orderNeedingMaterials.id,
      )
      if (reservedBuild) {
        const order = reservedState.constructionOrders.find(
          ({ id }) => id === reservedBuild.orderId,
        )
        return {
          dwarf: {
            ...dwarf,
            carrying: reservedBuild.material,
            task: {
              kind: 'build',
              target: reservedBuild.stand,
              path: reservedBuild.path,
              progress: 0,
              block: reservedBuild.material,
              buildingId: order?.buildingId,
              constructionOrderId: reservedBuild.orderId,
              purpose: order?.reason === 'access' ? 'access' : 'ordinary',
            },
          },
          world: reservedState.world,
          minedBlock: null,
          inventory: reservedState.inventory,
          constructionOrders: reservedState.constructionOrders,
        }
      }
    }

    const accessAssignment = chooseAccessTarget(state, dwarf)
    if (accessAssignment) {
      return {
        dwarf: {
          ...dwarf,
          task: {
            kind: 'dig',
            target: accessAssignment.target,
            path: accessAssignment.path,
            progress: 0,
            purpose: 'access',
            accessRequestId: accessAssignment.requestId,
          },
        },
        world: state.world,
        minedBlock: null,
      }
    }

    const assignment = chooseTarget(state, dwarf)
    return assignment
      ? {
          dwarf: {
            ...dwarf,
            task: {
              kind: 'dig',
              target: assignment.target,
              path: assignment.path,
              progress: 0,
              purpose: 'ordinary',
            },
          },
          world: state.world,
          minedBlock: null,
        }
      : unchanged(dwarf, state.world)
  }

  if (task.kind === 'haul' && !task.target) {
    if (!dwarf.carrying || !task.block) return unchanged(dwarf, state.world)
    const destination = selectStorageDestination(
      state,
      dwarf.carrying,
      dwarf.position,
      dwarf.id,
    )
    const path = destination
      ? findPath(state.world, dwarf.position, destination.position)
      : null
    if (destination && path) {
      const result = unchanged(
        {
          ...dwarf,
          task: {
            ...task,
            target: destination.position,
            path,
            buildingId: destination.id,
            purpose: 'recovery',
            recoveryReason: 'storage-route',
          },
        },
        state.world,
      )
      return result
    }
    return (
      attemptEmergencyRecovery(state, dwarf) ??
      unchanged(
        {
          ...dwarf,
          task: {
            ...task,
            purpose: 'recovery',
            recoveryReason: 'storage-route',
          },
        },
        state.world,
      )
    )
  }

  if (task.path.length > 0) {
    const movementSteps = Math.min(
      task.path.length,
      1 +
        state.upgrades.moveSpeed +
        (task.kind === 'haul' ? state.upgrades.satchel : 0),
    )
    if (!validPath(state.world, dwarf.position, task.path, movementSteps)) {
      return invalidateTask(state, dwarf)
    }
    return {
      dwarf: {
        ...dwarf,
        position: task.path[movementSteps - 1],
        task: { ...task, path: task.path.slice(movementSteps) },
      },
      world: state.world,
      minedBlock: null,
      progressed: true,
    }
  }

  if (task.kind === 'build' && task.target && task.constructionOrderId) {
    const order = state.constructionOrders.find(
      ({ id }) => id === task.constructionOrderId,
    )
    const material = task.block
    if (!samePosition(dwarf.position, task.target)) {
      return invalidateTask(state, dwarf)
    }
    if (!order || !material || dwarf.carrying !== material) {
      return material && dwarf.carrying === material
        ? invalidateTask(state, dwarf)
        : unchanged(
            {
              ...dwarf,
              carrying: null,
              task: { kind: 'idle', path: [], progress: 0 },
            },
            state.world,
          )
    }

    if (
      !canCompleteConstruction(
        state.world,
        order.buildingId,
        order.reason === 'storage-upgrade',
      )
    ) {
      return invalidateTask(state, dwarf)
    }

    const delivered = (order.delivered[material] ?? 0) + 1
    const reserved = Math.max(0, (order.reserved[material] ?? 0) - 1)
    const constructionOrders = state.constructionOrders.map((candidate) =>
      candidate.id === order.id
        ? {
            ...candidate,
            delivered: { ...candidate.delivered, [material]: delivered },
            reserved: { ...candidate.reserved, [material]: reserved },
            progress: delivered,
          }
        : candidate,
    )
    const updatedState = { ...state, constructionOrders }
    const completedState = Object.entries(order.required).every(
      ([requiredMaterial, requiredAmount]) =>
        (requiredMaterial === material
          ? delivered
          : (order.delivered[requiredMaterial as keyof Inventory] ?? 0)) >=
        (requiredAmount ?? 0),
    )
      ? completeConstruction(updatedState, order.id)
      : updatedState

    return {
      dwarf: {
        ...dwarf,
        carrying: null,
        task: { kind: 'idle', path: [], progress: 0 },
      },
      world: completedState.world,
      minedBlock: null,
      constructionOrders: completedState.constructionOrders,
      progressed: true,
    }
  }

  if (task.kind === 'dig' && task.target) {
    const target = task.target
    const adjacent =
      Math.max(
        Math.abs(dwarf.position.x - target.x),
        Math.abs(dwarf.position.y - target.y),
      ) === 1
    if (!adjacent) {
      return invalidateTask(state, dwarf)
    }
    const targetCell =
      state.world.cells[indexFor(target.x, target.y, state.world.width)]
    if (targetCell.block === 'air' || targetCell.block === 'bedrock') {
      return unchanged(
        { ...dwarf, task: { kind: 'idle', path: [], progress: 0 } },
        state.world,
      )
    }

    const minedBlock = targetCell.block
    const duration = Math.max(
      1,
      DIG_DURATION[minedBlock] - state.upgrades.toolPower * 2,
    )
    const nextProgress = task.progress + 1

    if (duration > 0 && nextProgress >= duration) {
      const safety = assessDigSafety(state, dwarf.position, target)
      if (!safety.safe || !safety.storage) {
        return unchanged(
          {
            ...dwarf,
            task: { kind: 'idle', path: [], progress: 0 },
          },
          state.world,
        )
      }
      const nextWorld = safety.recoveryWorld ?? clearCell(state.world, target)
      const haulTarget = safety.storage.position
      const haulOrigin = safety.landing ?? dwarf.position
      const haulPath = findPath(nextWorld, haulOrigin, haulTarget)
      if (!haulPath) {
        return unchanged(
          {
            ...dwarf,
            task: { kind: 'idle', path: [], progress: 0 },
          },
          state.world,
        )
      }
      const recoveryState = safety.recoveryMaterial
        ? consumeConstructionMaterial(
            { ...state, world: nextWorld },
            safety.recoveryMaterial,
            1,
          )
        : { ...state, world: nextWorld }
      if (!recoveryState) {
        return unchanged(
          {
            ...dwarf,
            task: { kind: 'idle', path: [], progress: 0 },
          },
          state.world,
        )
      }
      return {
        dwarf: {
          ...dwarf,
          position: haulOrigin,
          carrying: minedBlock,
          task: {
            kind: 'haul',
            target: haulTarget,
            path: haulPath,
            progress: 0,
            block: minedBlock,
            buildingId: safety.storage.id,
            ...(safety.landing
              ? {
                  purpose: 'recovery' as const,
                  recoveryReason: 'stranded' as const,
                }
              : { purpose: 'ordinary' as const }),
          },
        },
        world: recoveryState.world,
        minedBlock,
        inventory: safety.recoveryMaterial
          ? recoveryState.inventory
          : undefined,
        progressed: true,
      }
    }

    return {
      dwarf: { ...dwarf, task: { ...task, progress: nextProgress } },
      world: state.world,
      minedBlock: null,
      progressed: true,
    }
  }

  if (task.kind === 'haul' && task.target) {
    if (!samePosition(dwarf.position, task.target)) {
      return invalidateTask(state, dwarf)
    }
    if (task.buildingId && task.block) {
      const depositedWorld = depositCarriedMaterial(
        state.world,
        task.buildingId,
        task.block,
      )
      if (!depositedWorld) {
        return (
          attemptEmergencyRecovery(state, dwarf) ??
          unchanged(
            {
              ...dwarf,
              task: {
                ...task,
                purpose: 'recovery',
                recoveryReason: 'storage-route',
              },
            },
            state.world,
          )
        )
      }
      return {
        dwarf: {
          ...dwarf,
          carrying: null,
          task: { kind: 'idle', path: [], progress: 0 },
        },
        world: depositedWorld,
        minedBlock: null,
        depositedBlock: task.block,
        progressed: true,
      }
    }

    if (!dwarf.carrying) {
      return unchanged(
        { ...dwarf, task: { kind: 'idle', path: [], progress: 0 } },
        state.world,
      )
    }

    return (
      attemptEmergencyRecovery(state, dwarf) ??
      unchanged(
        {
          ...dwarf,
          task: {
            ...task,
            purpose: 'recovery',
            recoveryReason: 'storage-route',
          },
        },
        state.world,
      )
    )
  }

  return unchanged(
    { ...dwarf, task: { kind: 'idle', path: [], progress: 0 } },
    state.world,
  )
}

function stepOnce(state: SimulationState): SimulationState {
  if (state.completed) return { ...state, tick: state.tick + 1 }

  const recoveredState = recoverStaleAccessOrders(
    recoverStaleOutpostOrders(state),
  )
  const requestedState =
    state.safety.phase === 'blocked'
      ? planAccessRequests(reopenResolvedAccessRequests(recoveredState))
      : planAccessRequests(recoveredState)
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
    const before = settleDwarf(nextState.world, nextState.dwarves[index])
    nextState.dwarves[index] = before
    const worldBeforeAdvance = nextState.world
    const advanced = advanceDwarf(nextState, before)
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

  const hasSolids = nextState.world.cells.some((cell) =>
    MINEABLE_BLOCK_SET.has(cell.block),
  )
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

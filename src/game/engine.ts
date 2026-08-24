import {
  canCompleteConstruction,
  completeConstruction,
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
  depositCarriedMaterial,
  findEmergencyLadderPlan,
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  hasReachableStorage,
  isBootstrapProtectedTarget,
  planAccessConstructionOrder,
  planExpansionOrder,
  planOverflowDepotOrder,
  recoverOrphanedAccessOrders,
  recoverStaleAccessOrders,
  recoverStaleOutpostOrders,
  selectStorageDestination,
} from './logistics'
import {
  canMoveBetween,
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

type TargetCandidate = ReachableExposedSolid & { score: number }
type AdvanceResult = {
  dwarf: DwarfState
  world: World
  minedBlock: MineableBlockType | null
  depositedBlock?: MineableBlockType | null
  inventory?: SimulationState['inventory']
  constructionOrders?: SimulationState['constructionOrders']
  safety?: SimulationState['safety']
  progressed?: boolean
}

const reachableWorkCache = new WeakMap<
  World,
  Map<string, ReachableExposedSolid[]>
>()

function distance(first: Position, second: Position): number {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}

function taskKey(position: Position): string {
  return `${position.x}:${position.y}`
}

function reachableTargets(
  world: World,
  from: Position,
): ReachableExposedSolid[] {
  let byPosition = reachableWorkCache.get(world)
  if (!byPosition) {
    byPosition = new Map()
    reachableWorkCache.set(world, byPosition)
  }

  const key = taskKey(from)
  const cached = byPosition.get(key)
  if (cached) return cached

  const result = findReachableExposedSolids(world, from)
  byPosition.set(key, result)
  return result
}

function scoreTarget(
  state: SimulationState,
  target: Position,
  pathLength: number,
): number {
  const cell =
    state.world.cells[indexFor(target.x, target.y, state.world.width)]
  const mineralBonus = MINERAL_BLOCKS.has(cell.block) ? 50 : 0
  const preferredBonus =
    cell.block in state.policy.materialPriority &&
    state.policy.materialPriority[
      cell.block as keyof typeof state.policy.materialPriority
    ]
      ? 35
      : 0
  const depthBonus = state.world.height - target.y
  const baseScore =
    state.policy.workPreference === 'nearest'
      ? 100 - pathLength
      : state.policy.workPreference === 'deepest-first'
        ? depthBonus - pathLength
        : mineralBonus + preferredBonus - pathLength

  return baseScore + mineralBonus + preferredBonus
}

function compareCandidates(
  first: TargetCandidate,
  second: TargetCandidate,
  origin: Position,
): number {
  return (
    second.score - first.score ||
    distance(first.target, origin) - distance(second.target, origin)
  )
}

function chooseTarget(
  state: SimulationState,
  dwarf: DwarfState,
): ReachableExposedSolid | null {
  const reserved = new Set(
    state.dwarves
      .filter((candidate) => candidate.id !== dwarf.id && candidate.task.target)
      .map((candidate) =>
        candidate.task.target ? taskKey(candidate.task.target) : '',
      ),
  )

  const candidates = reachableTargets(state.world, dwarf.position)
    .filter(
      ({ target }) =>
        !reserved.has(taskKey(target)) &&
        !isBootstrapProtectedTarget(state, target),
    )
    .map(({ target, path }) => ({
      target,
      path,
      stand: path.at(-1) ?? dwarf.position,
      score: scoreTarget(state, target, path.length),
    }))
    .sort((first, second) => compareCandidates(first, second, dwarf.position))

  for (const candidate of candidates) {
    if (assessDigSafety(state, candidate.stand, candidate.target).safe) {
      return { target: candidate.target, path: candidate.path }
    }
  }
  return null
}

function findUnsafeTarget(
  state: SimulationState,
  dwarf: DwarfState,
):
  | (ReachableExposedSolid & {
      score: number
      stand: Position
      failure: AccessRequest['failure']
    })
  | null {
  const reserved = new Set(
    state.dwarves
      .filter((candidate) => candidate.id !== dwarf.id && candidate.task.target)
      .map((candidate) =>
        candidate.task.target ? taskKey(candidate.task.target) : '',
      ),
  )

  const candidates = reachableTargets(state.world, dwarf.position)
    .filter(
      ({ target }) =>
        !reserved.has(taskKey(target)) &&
        !isBootstrapProtectedTarget(state, target),
    )
    .map(({ target, path }) => ({
      target,
      path,
      stand: path.at(-1) ?? dwarf.position,
      score: scoreTarget(state, target, path.length),
    }))
    .sort((first, second) => compareCandidates(first, second, dwarf.position))

  for (const candidate of candidates) {
    const failure = assessDigSafety(
      state,
      candidate.stand,
      candidate.target,
    ).failure
    if (failure) return { ...candidate, failure }
  }
  return null
}

function chooseAccessTarget(
  state: SimulationState,
  dwarf: DwarfState,
): (ReachableExposedSolid & { requestId: string }) | null {
  const requests = state.accessRequests
    .filter(
      (request) =>
        request.status === 'open' && request.failure !== 'storage-route',
    )
    .sort((first, second) => second.priority - first.priority)

  for (const request of requests) {
    const candidates = reachableTargets(state.world, dwarf.position)
      .filter(({ target }) => taskKey(target) !== taskKey(request.target))
      .map(({ target, path }) => ({
        target,
        path,
        stand: path.at(-1) ?? dwarf.position,
      }))
      .sort(
        (first, second) =>
          distance(first.target, request.target) -
            distance(second.target, request.target) ||
          first.path.length - second.path.length,
      )

    for (const candidate of candidates) {
      if (assessDigSafety(state, candidate.stand, candidate.target).safe) {
        return { ...candidate, requestId: request.id }
      }
    }
  }

  return null
}

function resolveAccessRequests(state: SimulationState): SimulationState {
  return {
    ...state,
    accessRequests: state.accessRequests.map((request) => {
      if (request.status !== 'open') return request
      const safe = state.dwarves.some((dwarf) =>
        findAdjacentPaths(state.world, dwarf.position, request.target).some(
          ({ stand }) => assessDigSafety(state, stand, request.target).safe,
        ),
      )
      return safe ? { ...request, status: 'resolved' as const } : request
    }),
  }
}

function reopenAccessRequest(
  state: SimulationState,
  unsafe: ReachableExposedSolid & {
    score: number
    stand: Position
    failure: AccessRequest['failure']
  },
): SimulationState {
  const requestId = `access-${taskKey(unsafe.target)}`
  return {
    ...state,
    accessRequests: state.accessRequests.map((request) =>
      request.id === requestId && request.status === 'resolved'
        ? {
            ...request,
            failure: unsafe.failure,
            priority: unsafe.score,
            approach: unsafe.stand,
            worldRevision: state.worldRevision,
            status: 'open' as const,
            blockedReason: undefined,
          }
        : request,
    ),
  }
}

function reopenResolvedAccessRequests(state: SimulationState): SimulationState {
  let next = state
  for (const request of state.accessRequests) {
    if (request.status !== 'resolved') continue
    for (const dwarf of state.dwarves) {
      if (dwarf.task.kind !== 'idle' || dwarf.carrying) continue
      const candidate = reachableTargets(state.world, dwarf.position).find(
        ({ target }) => taskKey(target) === taskKey(request.target),
      )
      if (!candidate) continue
      const stand = candidate.path.at(-1) ?? dwarf.position
      const safety = assessDigSafety(state, stand, candidate.target)
      if (!safety.safe && safety.failure !== 'storage-route') {
        next = reopenAccessRequest(next, {
          ...candidate,
          stand,
          score: scoreTarget(state, candidate.target, candidate.path.length),
          failure: safety.failure ?? 'support',
        })
        break
      }
    }
  }
  return next
}

function trimOpenAccessRequests(state: SimulationState): SimulationState {
  const openRequests = state.accessRequests
    .filter((request) => request.status === 'open')
    .sort((first, second) => second.priority - first.priority)
  if (openRequests.length <= MAX_OPEN_ACCESS_REQUESTS) return state

  const retainedIds = new Set(
    openRequests
      .slice(0, MAX_OPEN_ACCESS_REQUESTS)
      .map((request) => request.id),
  )
  const discardedIds = new Set(
    openRequests.slice(MAX_OPEN_ACCESS_REQUESTS).map((request) => request.id),
  )
  const trimmed = {
    ...state,
    accessRequests: state.accessRequests.filter(
      (request) => request.status !== 'open' || retainedIds.has(request.id),
    ),
  }
  const recovered = recoverOrphanedAccessOrders(trimmed)
  const unrecoveredDiscardedOrder = recovered.constructionOrders.some(
    (order) =>
      order.reason === 'access' &&
      order.accessRequestId !== undefined &&
      discardedIds.has(order.accessRequestId),
  )
  return unrecoveredDiscardedOrder ? state : recovered
}

function planAccessRequests(state: SimulationState): SimulationState {
  let next = trimOpenAccessRequests(
    reopenResolvedAccessRequests(resolveAccessRequests(state)),
  )
  let openRequestCount = next.accessRequests.filter(
    (request) => request.status === 'open',
  ).length

  for (const dwarf of next.dwarves) {
    if (openRequestCount >= MAX_OPEN_ACCESS_REQUESTS) break
    if (dwarf.task.kind !== 'idle' || dwarf.carrying) continue
    const unsafe = findUnsafeTarget(next, dwarf)
    if (!unsafe || unsafe.failure === 'storage-route') continue
    const requestId = `access-${taskKey(unsafe.target)}`
    const existingRequest = next.accessRequests.find(
      (request) => request.id === requestId,
    )
    if (existingRequest?.status === 'resolved') {
      next = reopenAccessRequest(next, unsafe)
      openRequestCount += 1
      continue
    }
    if (existingRequest) {
      continue
    }
    next = {
      ...next,
      accessRequests: [
        ...next.accessRequests,
        {
          id: requestId,
          target: unsafe.target,
          failure: unsafe.failure,
          priority: unsafe.score,
          approach: unsafe.stand,
          worldRevision: next.worldRevision,
          status: 'open',
        },
      ],
    }
    openRequestCount += 1
  }

  for (const request of next.accessRequests) {
    next = planAccessConstructionOrder(next, request)
  }
  return next
}

function chooseBuildOrder(
  state: SimulationState,
  dwarf: DwarfState,
  onlyOrderId?: string,
): {
  orderId: string
  path: Position[]
  stand: Position
  material: keyof Inventory
} | null {
  const activeClaims = (orderId: string, material: keyof Inventory) =>
    state.dwarves.filter(
      (candidate) =>
        candidate.task.kind === 'build' &&
        candidate.task.constructionOrderId === orderId &&
        candidate.carrying === material,
    ).length

  const candidates = state.constructionOrders
    .filter((order) => {
      if (onlyOrderId !== undefined && order.id !== onlyOrderId) return false
      const building = state.world.buildings.find(
        ({ id }) => id === order.buildingId,
      )
      if (!building || building.construction === 'completed') return false
      if (
        state.constructionPolicy === 'conserve' &&
        order.reason !== 'access'
      ) {
        return false
      }
      return Object.keys(order.required).some((material) => {
        const key = material as keyof Inventory
        const required = order.required[key] ?? 0
        const delivered = order.delivered[key] ?? 0
        const reserved = order.reserved[key] ?? 0
        return (
          delivered < required && reserved - activeClaims(order.id, key) > 0
        )
      })
    })
    .flatMap((order) => {
      const material = (
        Object.keys(order.required) as Array<keyof Inventory>
      ).find((key) => {
        const required = order.required[key] ?? 0
        const delivered = order.delivered[key] ?? 0
        const reserved = order.reserved[key] ?? 0
        return (
          delivered < required && reserved - activeClaims(order.id, key) > 0
        )
      })
      if (!material) return []
      const building = state.world.buildings.find(
        ({ id }) => id === order.buildingId,
      )
      if (!building) return []
      const route = findAdjacentPaths(
        state.world,
        dwarf.position,
        building.position,
      )[0]
      return route
        ? [{ orderId: order.id, reason: order.reason, material, ...route }]
        : []
    })
    .sort((first, second) => {
      const rank = (reason: ConstructionOrder['reason']) =>
        reason === 'access' ? 0 : reason === 'capacity' ? 1 : 2
      return (
        rank(first.reason) - rank(second.reason) ||
        first.path.length - second.path.length
      )
    })

  return candidates[0] ?? null
}

function clearCell(world: World, target: Position): World {
  const targetIndex = indexFor(target.x, target.y, world.width)
  return {
    ...world,
    cells: world.cells.map((cell, index) =>
      index === targetIndex ? { ...cell, block: 'air' as const } : cell,
    ),
  }
}

function unchanged(dwarf: DwarfState, world: World): AdvanceResult {
  return { dwarf, world, minedBlock: null }
}

function samePosition(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y
}

function validPath(
  world: World,
  from: Position,
  path: Position[],
  steps: number,
): boolean {
  let current = from
  for (const next of path.slice(0, steps)) {
    if (!canMoveBetween(world, current, next)) return false
    current = next
  }
  return true
}

function invalidateTask(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const buildMaterial =
    dwarf.task.kind === 'build' && dwarf.task.constructionOrderId
      ? dwarf.carrying
      : null
  const returnedMaterial = buildMaterial
    ? returnMaterialToStorage(state.world, buildMaterial)
    : { world: state.world, stored: false }
  const inventory =
    buildMaterial && returnedMaterial.stored
      ? {
          ...state.inventory,
          [buildMaterial]: state.inventory[buildMaterial] + 1,
        }
      : undefined
  const constructionOrders =
    buildMaterial && dwarf.task.constructionOrderId
      ? state.constructionOrders.map((order) =>
          order.id === dwarf.task.constructionOrderId
            ? {
                ...order,
                reserved: {
                  ...order.reserved,
                  [buildMaterial]: Math.max(
                    0,
                    (order.reserved[buildMaterial] ?? 0) - 1,
                  ),
                },
              }
            : order,
        )
      : undefined
  return {
    dwarf: {
      ...dwarf,
      carrying:
        buildMaterial && returnedMaterial.stored ? null : dwarf.carrying,
      task:
        buildMaterial && returnedMaterial.stored
          ? { kind: 'idle', path: [], progress: 0 }
          : recoveryTask(dwarf, dwarf.carrying ? 'storage-route' : 'stranded'),
    },
    world: returnedMaterial.world,
    minedBlock: null,
    inventory,
    constructionOrders,
  }
}

function recoveryTask(dwarf: DwarfState, reason: 'stranded' | 'storage-route') {
  const currentBuildingId =
    dwarf.task.kind === 'haul' ? dwarf.task.buildingId : undefined
  return dwarf.carrying
    ? {
        kind: 'haul' as const,
        path: [],
        progress: 0,
        block: dwarf.carrying,
        ...(currentBuildingId ? { buildingId: currentBuildingId } : {}),
        purpose: 'recovery' as const,
        recoveryReason: 'storage-route' as const,
      }
    : {
        kind: 'idle' as const,
        path: [],
        progress: 0,
        purpose: 'recovery' as const,
        recoveryReason: reason,
      }
}

function attemptEmergencyRecovery(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult | null {
  const usesCarriedMaterial =
    dwarf.carrying !== null && !MINERAL_BLOCKS.has(dwarf.carrying)
  const reserveMaterial = getEmergencyReserveMaterial(state.inventory)
  const usesReserve =
    !usesCarriedMaterial &&
    state.safety.emergencyStone > 0 &&
    reserveMaterial !== null
  if (!usesCarriedMaterial && !usesReserve) return null

  const plan = findEmergencyLadderPlan(
    state,
    dwarf.position,
    dwarf.carrying ?? reserveMaterial ?? 'stone',
  )
  if (!plan) return null

  const inventory = usesReserve
    ? {
        ...state.inventory,
        [reserveMaterial]: Math.max(0, state.inventory[reserveMaterial] - 1),
      }
    : undefined
  const retainedCarriedMaterial = usesCarriedMaterial ? null : dwarf.carrying
  const task = {
    kind: 'haul' as const,
    target: plan.destination.position,
    path: plan.path,
    progress: 0,
    ...(retainedCarriedMaterial ? { block: retainedCarriedMaterial } : {}),
    buildingId: plan.destination.id,
    purpose: 'recovery' as const,
    recoveryReason:
      dwarf.movement === 'stranded'
        ? ('stranded' as const)
        : ('storage-route' as const),
  }

  return {
    dwarf: {
      ...dwarf,
      movement: 'grounded',
      carrying: retainedCarriedMaterial,
      task,
    },
    world: plan.world,
    minedBlock: null,
    inventory,
    safety: usesReserve
      ? { ...state.safety, emergencyStone: state.safety.emergencyStone - 1 }
      : state.safety,
    progressed: true,
  }
}

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

function settleDwarf(world: World, dwarf: DwarfState): DwarfState {
  if (isSupported(world, dwarf.position)) {
    return { ...dwarf, movement: 'grounded' }
  }

  for (let y = dwarf.position.y - 1; y >= 0; y -= 1) {
    const candidate = { x: dwarf.position.x, y }
    if (getCell(world, candidate.x, candidate.y).block !== 'air') continue
    if (!isSupported(world, candidate)) continue
    return {
      ...dwarf,
      position: candidate,
      movement: 'falling',
      task: recoveryTask(dwarf, 'stranded'),
    }
  }

  return {
    ...dwarf,
    movement: 'stranded',
    task: recoveryTask(dwarf, 'stranded'),
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
          building.construction !== 'completed' &&
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
          reason === 'access' ? 0 : reason === 'capacity' ? 1 : 2
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

    if (!canCompleteConstruction(state.world, order.buildingId)) {
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
    if (distance(dwarf.position, target) !== 1) {
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
      const nextWorld = clearCell(state.world, target)
      const haulTarget = safety.storage.position
      const haulPath = findPath(nextWorld, dwarf.position, haulTarget)
      if (!haulPath) {
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
          carrying: minedBlock,
          task: {
            kind: 'haul',
            target: haulTarget,
            path: haulPath,
            progress: 0,
            block: minedBlock,
            buildingId: safety.storage.id,
            purpose: 'ordinary',
          },
        },
        world: nextWorld,
        minedBlock,
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
      ? reopenResolvedAccessRequests(recoveredState)
      : planAccessRequests(recoveredState)
  const capacityState = planOverflowDepotOrder(requestedState)
  const plannedState =
    state.safety.phase === 'blocked'
      ? capacityState
      : planExpansionOrder(capacityState)

  const nextState: SimulationState = {
    ...plannedState,
    tick: plannedState.tick + 1,
    inventory: cloneInventory(plannedState.inventory),
    dwarves: plannedState.dwarves.slice(),
  }

  let progressedThisTick = false
  for (let index = 0; index < state.dwarves.length; index += 1) {
    const before = settleDwarf(nextState.world, nextState.dwarves[index])
    nextState.dwarves[index] = before
    const worldBeforeAdvance = nextState.world
    const advanced = advanceDwarf(nextState, before)
    nextState.dwarves[index] = advanced.dwarf
    nextState.world = advanced.world
    if (
      advanced.world.cells !== worldBeforeAdvance.cells ||
      advanced.world.buildings !== worldBeforeAdvance.buildings
    ) {
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

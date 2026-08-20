import { completeConstruction, reserveConstructionMaterials } from './buildings'
import {
  COMMON_BUILDING_MATERIALS,
  DIG_DURATION,
  getEmergencyReserveMaterial,
  MAX_OPEN_ACCESS_REQUESTS,
  MINEABLE_BLOCKS,
  MINERAL_BLOCKS,
  STARTER_BOOTSTRAP_CLEAR_COUNT,
} from './content'
import { getCell } from './generation'
import {
  assessDigSafety,
  depositCarriedMaterial,
  findEmergencyLadderPlan,
  getAvailableConstructionMaterial,
  isBootstrapProtectedTarget,
  planAccessConstructionOrder,
  planExpansionOrder,
  selectStorageDestination,
} from './logistics'
import {
  findAdjacentPaths,
  findPath,
  findReachableExposedSolids,
  isSupported,
  type ReachableExposedSolid,
} from './pathfinding'
import {
  type AccessRequest,
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
    .filter(
      (candidate) =>
        assessDigSafety(state, candidate.stand, candidate.target).safe,
    )
    .sort((first, second) => compareCandidates(first, second, dwarf.position))

  const selected = candidates[0]
  return selected ? { target: selected.target, path: selected.path } : null
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
    .map(({ target, path }) => {
      const safety = assessDigSafety(
        state,
        path.at(-1) ?? dwarf.position,
        target,
      )
      return {
        target,
        path,
        stand: path.at(-1) ?? dwarf.position,
        score: scoreTarget(state, target, path.length),
        failure: safety.failure,
      }
    })
    .filter(
      (
        candidate,
      ): candidate is typeof candidate & {
        failure: AccessRequest['failure']
      } => candidate.failure !== undefined,
    )
    .sort((first, second) => compareCandidates(first, second, dwarf.position))

  return candidates[0] ?? null
}

function chooseAccessTarget(
  state: SimulationState,
  dwarf: DwarfState,
): (ReachableExposedSolid & { requestId: string }) | null {
  const requests = state.accessRequests
    .filter((request) => request.status === 'open')
    .sort((first, second) => second.priority - first.priority)

  for (const request of requests) {
    const candidates = reachableTargets(state.world, dwarf.position)
      .filter(({ target }) => taskKey(target) !== taskKey(request.target))
      .map(({ target, path }) => ({
        target,
        path,
        stand: path.at(-1) ?? dwarf.position,
      }))
      .filter(
        (candidate) =>
          assessDigSafety(state, candidate.stand, candidate.target).safe,
      )
      .sort(
        (first, second) =>
          distance(first.target, request.target) -
            distance(second.target, request.target) ||
          first.path.length - second.path.length,
      )

    if (candidates[0]) return { ...candidates[0], requestId: request.id }
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
  return {
    ...state,
    accessRequests: state.accessRequests.filter(
      (request) => request.status !== 'open' || retainedIds.has(request.id),
    ),
  }
}

function planAccessRequests(state: SimulationState): SimulationState {
  let next = trimOpenAccessRequests(resolveAccessRequests(state))
  let openRequestCount = next.accessRequests.filter(
    (request) => request.status === 'open',
  ).length

  for (const dwarf of next.dwarves) {
    if (openRequestCount >= MAX_OPEN_ACCESS_REQUESTS) break
    if (dwarf.task.kind !== 'idle' || dwarf.carrying) continue
    const unsafe = findUnsafeTarget(next, dwarf)
    if (!unsafe) continue
    const requestId = `access-${taskKey(unsafe.target)}`
    if (next.accessRequests.some((request) => request.id === requestId)) {
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
): {
  orderId: string
  path: Position[]
  stand: Position
  material: keyof Inventory
} | null {
  const candidates = state.constructionOrders
    .filter((order) => {
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
        return delivered < required && reserved > 0
      })
    })
    .flatMap((order) => {
      const material = (
        Object.keys(order.required) as Array<keyof Inventory>
      ).find((key) => {
        const required = order.required[key] ?? 0
        const delivered = order.delivered[key] ?? 0
        const reserved = order.reserved[key] ?? 0
        return delivered < required && reserved > 0
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
    .sort(
      (first, second) =>
        Number(first.reason !== 'access') -
          Number(second.reason !== 'access') ||
        first.path.length - second.path.length,
    )

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

function recoveryTask(dwarf: DwarfState, reason: 'stranded' | 'storage-route') {
  return dwarf.carrying
    ? {
        kind: 'haul' as const,
        path: [],
        progress: 0,
        block: dwarf.carrying,
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
  }
}

function updateSafetyState(state: SimulationState): SimulationState['safety'] {
  if (
    state.safety.phase === 'bootstrap' &&
    state.totalCleared < STARTER_BOOTSTRAP_CLEAR_COUNT
  ) {
    return state.safety
  }

  const hasSafeWork = state.dwarves.some(
    (dwarf) =>
      dwarf.task.kind === 'idle' && chooseTarget(state, dwarf) !== null,
  )
  const hasBuildWork = state.constructionOrders.some((order) => {
    return Object.keys(order.required).some((material) => {
      const key = material as keyof Inventory
      const required = order.required[key] ?? 0
      const delivered = order.delivered[key] ?? 0
      return delivered < required && (order.reserved[key] ?? 0) > 0
    })
  })
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

  if (
    !hasSafeWork &&
    !hasBuildWork &&
    hasWaitingAccess &&
    COMMON_BUILDING_MATERIALS.every(
      (material) => getAvailableConstructionMaterial(state, material) === 0,
    )
  ) {
    return {
      phase: 'blocked',
      emergencyStone: state.safety.emergencyStone,
      blockedReason: 'waiting-for-stone',
    }
  }

  if (hasRecovery && !hasSafeWork && !hasBuildWork) {
    return {
      phase: 'blocked',
      emergencyStone: state.safety.emergencyStone,
      blockedReason: 'awaiting-recovery',
    }
  }

  return {
    phase: 'operational',
    emergencyStone: state.safety.emergencyStone,
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
      )
      const path = destination
        ? findPath(state.world, dwarf.position, destination.position)
        : null
      if (destination && path) {
        return unchanged(
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

    const orderNeedingMaterials = state.constructionOrders
      .filter((order) =>
        Object.keys(order.required).some((material) => {
          const key = material as keyof Inventory
          const required = order.required[key] ?? 0
          const delivered = order.delivered[key] ?? 0
          const reserved = order.reserved[key] ?? 0
          return delivered < required && reserved < required - delivered
        }),
      )
      .sort(
        (first, second) =>
          Number(first.reason !== 'access') -
          Number(second.reason !== 'access'),
      )[0]
    if (orderNeedingMaterials) {
      const reservedState = reserveConstructionMaterials(
        state,
        orderNeedingMaterials.id,
      )
      const reservedBuild = chooseBuildOrder(reservedState, dwarf)
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
    )
    const path = destination
      ? findPath(state.world, dwarf.position, destination.position)
      : null
    if (destination && path) {
      return unchanged(
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
      1 + state.upgrades.moveSpeed,
    )
    return unchanged(
      {
        ...dwarf,
        position: task.path[movementSteps - 1],
        task: { ...task, path: task.path.slice(movementSteps) },
      },
      state.world,
    )
  }

  if (task.kind === 'build' && task.target && task.constructionOrderId) {
    const order = state.constructionOrders.find(
      ({ id }) => id === task.constructionOrderId,
    )
    const material = task.block
    if (!order || !material || dwarf.carrying !== material) {
      return unchanged(
        {
          ...dwarf,
          carrying: null,
          task: { kind: 'idle', path: [], progress: 0 },
        },
        state.world,
      )
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
    const completedState =
      delivered >= (order.required[material] ?? 0)
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
    }
  }

  if (task.kind === 'dig' && task.target) {
    const target = task.target
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
      }
    }

    return unchanged(
      { ...dwarf, task: { ...task, progress: nextProgress } },
      state.world,
    )
  }

  if (task.kind === 'haul' && task.target) {
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

  const plannedState = planExpansionOrder(planAccessRequests(state))

  const nextState: SimulationState = {
    ...plannedState,
    tick: plannedState.tick + 1,
    inventory: cloneInventory(plannedState.inventory),
    dwarves: plannedState.dwarves.slice(),
  }

  nextState.dwarves = nextState.dwarves.map((dwarf) =>
    settleDwarf(nextState.world, dwarf),
  )

  for (let index = 0; index < state.dwarves.length; index += 1) {
    const before = nextState.dwarves[index]
    const worldBeforeAdvance = nextState.world
    const advanced = advanceDwarf(nextState, before)
    nextState.dwarves[index] = advanced.dwarf
    nextState.world = advanced.world
    if (
      advanced.world.cells !== worldBeforeAdvance.cells ||
      advanced.world.buildings !== worldBeforeAdvance.buildings
    ) {
      nextState.worldRevision += 1
    }
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
    MINEABLE_BLOCKS.some((block) => block === cell.block),
  )
  const allDwarvesSettled = nextState.dwarves.every(
    (dwarf) => dwarf.task.kind === 'idle' && dwarf.carrying === null,
  )
  return {
    ...nextState,
    safety: updateSafetyState(nextState),
    completed: !hasSolids && allDwarvesSettled,
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

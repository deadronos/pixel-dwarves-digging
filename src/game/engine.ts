import { completeConstruction, reserveConstructionMaterials } from './buildings'
import { DIG_DURATION, MINERAL_BLOCKS } from './content'
import { getCell } from './generation'
import {
  depositCarriedMaterial,
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
  cloneInventory,
  type DwarfState,
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
    .filter(({ target }) => !reserved.has(taskKey(target)))
    .map(({ target, path }) => ({
      target,
      path,
      score: scoreTarget(state, target, path.length),
    }))
    .sort((first, second) => compareCandidates(first, second, dwarf.position))

  const selected = candidates[0]
  return selected ? { target: selected.target, path: selected.path } : null
}

function chooseBuildOrder(
  state: SimulationState,
  dwarf: DwarfState,
): { orderId: string; path: Position[]; stand: Position } | null {
  const candidates = state.constructionOrders
    .filter((order) => {
      if (
        state.constructionPolicy === 'conserve' &&
        order.reason !== 'access'
      ) {
        return false
      }
      const required = order.required.stone ?? 0
      const delivered = order.delivered.stone ?? 0
      const reserved = order.reserved.stone ?? 0
      return delivered < required && reserved > 0
    })
    .flatMap((order) => {
      const building = state.world.buildings.find(
        ({ id }) => id === order.buildingId,
      )
      if (!building) return []
      const route = findAdjacentPaths(
        state.world,
        dwarf.position,
        building.position,
      )[0]
      return route ? [{ orderId: order.id, ...route }] : []
    })
    .sort((first, second) => first.path.length - second.path.length)

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
      task: { kind: 'idle', path: [], progress: 0 },
    }
  }

  return {
    ...dwarf,
    movement: 'stranded',
    task: { kind: 'idle', path: [], progress: 0 },
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
    return unchanged(dwarf, state.world)
  }

  const task = dwarf.task

  if (task.kind === 'idle') {
    const buildOrder = chooseBuildOrder(state, dwarf)
    if (buildOrder) {
      const order = state.constructionOrders.find(
        ({ id }) => id === buildOrder.orderId,
      )
      return {
        dwarf: {
          ...dwarf,
          carrying: 'stone',
          task: {
            kind: 'build',
            target: buildOrder.stand,
            path: buildOrder.path,
            progress: 0,
            block: 'stone',
            buildingId: order?.buildingId,
            constructionOrderId: buildOrder.orderId,
          },
        },
        world: state.world,
        minedBlock: null,
      }
    }

    const orderNeedingMaterials = state.constructionOrders.find((order) => {
      const required = order.required.stone ?? 0
      const delivered = order.delivered.stone ?? 0
      const reserved = order.reserved.stone ?? 0
      return delivered < required && reserved < required - delivered
    })
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
            carrying: 'stone',
            task: {
              kind: 'build',
              target: reservedBuild.stand,
              path: reservedBuild.path,
              progress: 0,
              block: 'stone',
              buildingId: order?.buildingId,
              constructionOrderId: reservedBuild.orderId,
            },
          },
          world: reservedState.world,
          minedBlock: null,
          inventory: reservedState.inventory,
          constructionOrders: reservedState.constructionOrders,
        }
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
            },
          },
          world: state.world,
          minedBlock: null,
        }
      : unchanged(dwarf, state.world)
  }

  if (task.kind === 'haul' && !task.target) {
    return unchanged(dwarf, state.world)
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
    if (!order || dwarf.carrying !== 'stone') {
      return unchanged(
        {
          ...dwarf,
          carrying: null,
          task: { kind: 'idle', path: [], progress: 0 },
        },
        state.world,
      )
    }

    const delivered = (order.delivered.stone ?? 0) + 1
    const reserved = Math.max(0, (order.reserved.stone ?? 0) - 1)
    const constructionOrders = state.constructionOrders.map((candidate) =>
      candidate.id === order.id
        ? {
            ...candidate,
            delivered: { ...candidate.delivered, stone: delivered },
            reserved: { ...candidate.reserved, stone: reserved },
            progress: delivered,
          }
        : candidate,
    )
    const updatedState = { ...state, constructionOrders }
    const completedState =
      delivered >= (order.required.stone ?? 0)
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
    if (targetCell.block === 'air') {
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
      const nextWorld = clearCell(state.world, target)
      const destination = selectStorageDestination(
        { ...state, world: nextWorld },
        minedBlock,
        dwarf.position,
      )
      const haulTarget = destination?.position ?? nextWorld.stockpile
      const haulPath = findPath(nextWorld, dwarf.position, haulTarget) ?? []
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
            buildingId: destination?.id,
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
      if (!depositedWorld) return unchanged(dwarf, state.world)
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

    return unchanged(
      {
        ...dwarf,
        carrying: null,
        task: { kind: 'idle', path: [], progress: 0 },
      },
      state.world,
    )
  }

  return unchanged(
    { ...dwarf, task: { kind: 'idle', path: [], progress: 0 } },
    state.world,
  )
}

function stepOnce(state: SimulationState): SimulationState {
  if (state.completed) return { ...state, tick: state.tick + 1 }

  const plannedState = planExpansionOrder(state)

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
    const advanced = advanceDwarf(nextState, before)
    nextState.dwarves[index] = advanced.dwarf
    nextState.world = advanced.world
    if (advanced.inventory) nextState.inventory = advanced.inventory
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

  const hasSolids = nextState.world.cells.some((cell) => cell.block !== 'air')
  const allDwarvesSettled = nextState.dwarves.every(
    (dwarf) => dwarf.task.kind === 'idle' && dwarf.carrying === null,
  )
  return { ...nextState, completed: !hasSolids && allDwarvesSettled }
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

import { DIG_DURATION, MINERAL_BLOCKS } from './content'
import {
  findPath,
  findReachableExposedSolids,
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

function advanceDwarf(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const task = dwarf.task

  if (task.kind === 'idle') {
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
      const haulPath =
        findPath(nextWorld, dwarf.position, nextWorld.stockpile) ?? []
      return {
        dwarf: {
          ...dwarf,
          carrying: minedBlock,
          task: {
            kind: 'haul',
            target: nextWorld.stockpile,
            path: haulPath,
            progress: 0,
            block: minedBlock,
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

  const nextState: SimulationState = {
    ...state,
    tick: state.tick + 1,
    inventory: cloneInventory(state.inventory),
    dwarves: state.dwarves.slice(),
  }

  for (let index = 0; index < state.dwarves.length; index += 1) {
    const before = nextState.dwarves[index]
    const advanced = advanceDwarf(nextState, before)
    nextState.dwarves[index] = advanced.dwarf
    nextState.world = advanced.world

    if (advanced.minedBlock) {
      nextState.inventory[advanced.minedBlock] += 1
      nextState.totalCleared += 1
      if (advanced.minedBlock === 'relic') nextState.discoveredRelics += 1
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

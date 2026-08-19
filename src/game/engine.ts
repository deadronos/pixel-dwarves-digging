import { DIG_DURATION, MINERAL_BLOCKS } from './content'
import { findAdjacentPaths, findExposedSolids, findPath } from './pathfinding'
import {
  cloneInventory,
  type DwarfState,
  indexFor,
  type Position,
  type SimulationState,
} from './types'

function distance(first: Position, second: Position): number {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}

function taskKey(position: Position): string {
  return `${position.x}:${position.y}`
}

function chooseTarget(
  state: SimulationState,
  dwarf: DwarfState,
): { target: Position; path: Position[] } | null {
  const reserved = new Set(
    state.dwarves
      .filter((candidate) => candidate.id !== dwarf.id && candidate.task.target)
      .map((candidate) =>
        candidate.task.target ? taskKey(candidate.task.target) : '',
      ),
  )

  const candidates = findExposedSolids(state.world, dwarf.position)
    .filter((target) => !reserved.has(taskKey(target)))
    .map((target) => {
      const cell =
        state.world.cells[indexFor(target.x, target.y, state.world.width)]
      const adjacent = findAdjacentPaths(state.world, dwarf.position, target)[0]
      if (!adjacent) return null

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
          ? 100 - adjacent.path.length
          : state.policy.workPreference === 'deepest-first'
            ? depthBonus - adjacent.path.length
            : mineralBonus + preferredBonus - adjacent.path.length

      return {
        target,
        path: adjacent.path,
        score: baseScore + mineralBonus + preferredBonus,
      }
    })
    .filter(
      (
        candidate,
      ): candidate is { target: Position; path: Position[]; score: number } =>
        candidate !== null,
    )
    .sort(
      (first, second) =>
        second.score - first.score ||
        distance(first.target, dwarf.position) -
          distance(second.target, dwarf.position),
    )

  const selected = candidates[0]
  return selected ? { target: selected.target, path: selected.path } : null
}

function advanceDwarf(state: SimulationState, dwarf: DwarfState): DwarfState {
  const task = dwarf.task

  if (task.kind === 'idle') {
    const assignment = chooseTarget(state, dwarf)
    return assignment
      ? {
          ...dwarf,
          task: {
            kind: 'dig',
            target: assignment.target,
            path: assignment.path,
            progress: 0,
          },
        }
      : dwarf
  }

  if (task.path.length > 0) {
    return {
      ...dwarf,
      position: task.path[0],
      task: { ...task, path: task.path.slice(1) },
    }
  }

  if (task.kind === 'dig' && task.target) {
    const target = task.target
    const targetCell =
      state.world.cells[indexFor(target.x, target.y, state.world.width)]
    if (targetCell.block === 'air') {
      return { ...dwarf, task: { kind: 'idle', path: [], progress: 0 } }
    }

    const minedBlock = targetCell.block
    const duration = DIG_DURATION[minedBlock]
    const nextProgress = task.progress + 1

    if (duration > 0 && nextProgress >= duration) {
      const nextWorld = {
        ...state.world,
        cells: state.world.cells.map((cell, index) =>
          index === indexFor(target.x, target.y, state.world.width)
            ? { ...cell, block: 'air' as const }
            : cell,
        ),
      }
      const haulPath =
        findPath(nextWorld, dwarf.position, nextWorld.stockpile) ?? []
      return {
        ...dwarf,
        carrying: minedBlock,
        task: {
          kind: 'haul',
          target: nextWorld.stockpile,
          path: haulPath,
          progress: 0,
          block: minedBlock,
        },
      }
    }

    return { ...dwarf, task: { ...task, progress: nextProgress } }
  }

  if (task.kind === 'haul' && task.target) {
    return {
      ...dwarf,
      carrying: null,
      task: { kind: 'idle', path: [], progress: 0 },
    }
  }

  return { ...dwarf, task: { kind: 'idle', path: [], progress: 0 } }
}

function stepOnce(state: SimulationState): SimulationState {
  if (state.completed) return { ...state, tick: state.tick + 1 }

  const nextState: SimulationState = {
    ...state,
    tick: state.tick + 1,
    inventory: cloneInventory(state.inventory),
    world: { ...state.world, cells: [...state.world.cells] },
  }

  for (const dwarf of state.dwarves) {
    const before =
      nextState.dwarves.find((candidate) => candidate.id === dwarf.id) ?? dwarf
    const after = advanceDwarf(nextState, before)

    if (
      before.task.kind === 'dig' &&
      after.task.kind === 'haul' &&
      before.task.target &&
      after.carrying
    ) {
      const target = before.task.target
      const block = after.carrying
      nextState.inventory[block] += 1
      nextState.totalCleared += 1
      if (block === 'relic') nextState.discoveredRelics += 1
      nextState.world = {
        ...nextState.world,
        cells: nextState.world.cells.map((cell, index) =>
          index === indexFor(target.x, target.y, nextState.world.width)
            ? { ...cell, block: 'air' as const }
            : cell,
        ),
      }
    }

    nextState.dwarves = nextState.dwarves.map((candidate) =>
      candidate.id === after.id ? after : candidate,
    )
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

import {
  MINERAL_BLOCKS,
} from '../content'
import {
  findReachableExposedSolids,
  type ReachableExposedSolid,
} from '../pathfinding'
import {
  assessDigSafety,
  isBootstrapProtectedTarget,
} from '../logistics'
import type {
  AccessRequest,
  DwarfState,
  Position,
  SimulationState,
  World,
} from '../types'

type TargetCandidate = ReachableExposedSolid & { score: number }

const reachableWorkCache = new WeakMap<
  World,
  Map<string, ReachableExposedSolid[]>
>()

export function distance(first: Position, second: Position): number {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}

export function taskKey(position: Position): string {
  return `${position.x}:${position.y}`
}

export function reachableTargets(
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

export function scoreTarget(
  state: SimulationState,
  target: Position,
  pathLength: number,
): number {
  const cell = state.world.cells[target.y * state.world.width + target.x]
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

export function chooseTarget(
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

export function findUnsafeTarget(
  state: SimulationState,
  dwarf: DwarfState,
): (ReachableExposedSolid & {
  score: number
  stand: Position
  failure: AccessRequest['failure']
}) | null {
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

export function chooseAccessTarget(
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

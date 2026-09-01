import { MINERAL_BLOCKS } from '../content'
import { assessDigSafety, isBootstrapProtectedTarget } from '../logistics'
import {
  findReachableExposedSolids,
  getTopologyKey,
  type ReachableExposedSolid,
} from '../pathfinding'
import type {
  AccessRequest,
  DwarfState,
  Position,
  SimulationState,
  World,
} from '../types'

export type TargetCandidate = ReachableExposedSolid & {
  score: number
  stand: Position
}

export type TargetPlanningSnapshot = {
  reachableCandidates: TargetCandidate[]
  rankedWorkCandidates: TargetCandidate[]
}

export type TargetPlanningContext = {
  getSnapshot: (
    state: SimulationState,
    dwarf: DwarfState,
  ) => TargetPlanningSnapshot
}

const reachableWorkCache = new WeakMap<
  object,
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
  const topologyKey = getTopologyKey(world)
  let byPosition = reachableWorkCache.get(topologyKey)
  if (!byPosition) {
    byPosition = new Map()
    reachableWorkCache.set(topologyKey, byPosition)
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

export function createTargetPlanningContext(
  state: SimulationState,
): TargetPlanningContext {
  const snapshots = new Map<string, TargetPlanningSnapshot>()
  let plannedWorld = state.world
  let plannedPolicy = state.policy

  return {
    getSnapshot(currentState, dwarf) {
      if (
        currentState.world !== plannedWorld ||
        currentState.policy !== plannedPolicy
      ) {
        snapshots.clear()
        plannedWorld = currentState.world
        plannedPolicy = currentState.policy
      }

      const key = `${dwarf.id}:${taskKey(dwarf.position)}`
      const cached = snapshots.get(key)
      if (cached) return cached

      const reachableCandidates = reachableTargets(
        currentState.world,
        dwarf.position,
      ).map(({ target, path }) => ({
        target,
        path,
        stand: path.at(-1) ?? dwarf.position,
        score: scoreTarget(currentState, target, path.length),
      }))
      const snapshot = {
        reachableCandidates,
        rankedWorkCandidates: reachableCandidates
          .slice()
          .sort((first, second) =>
            compareCandidates(first, second, dwarf.position),
          ),
      }
      snapshots.set(key, snapshot)
      return snapshot
    },
  }
}

export function getTargetPlanningSnapshot(
  context: TargetPlanningContext,
  state: SimulationState,
  dwarf: DwarfState,
): TargetPlanningSnapshot {
  return context.getSnapshot(state, dwarf)
}

export function rankedWorkCandidates(
  state: SimulationState,
  dwarf: DwarfState,
  context?: TargetPlanningContext,
): TargetCandidate[] {
  const reserved = new Set(
    state.dwarves
      .filter((candidate) => candidate.id !== dwarf.id && candidate.task.target)
      .map((candidate) =>
        candidate.task.target ? taskKey(candidate.task.target) : '',
      ),
  )

  const snapshot = getTargetPlanningSnapshot(
    context ?? createTargetPlanningContext(state),
    state,
    dwarf,
  )
  return snapshot.rankedWorkCandidates.filter(
    ({ target }) =>
      !reserved.has(taskKey(target)) &&
      !isBootstrapProtectedTarget(state, target),
  )
}

export function chooseTarget(
  state: SimulationState,
  dwarf: DwarfState,
  context?: TargetPlanningContext,
): ReachableExposedSolid | null {
  for (const candidate of rankedWorkCandidates(state, dwarf, context)) {
    if (assessDigSafety(state, candidate.stand, candidate.target).safe) {
      return { target: candidate.target, path: candidate.path }
    }
  }
  return null
}

export function findUnsafeTarget(
  state: SimulationState,
  dwarf: DwarfState,
  context?: TargetPlanningContext,
):
  | (ReachableExposedSolid & {
      score: number
      stand: Position
      failure: AccessRequest['failure']
    })
  | null {
  for (const candidate of rankedWorkCandidates(state, dwarf, context)) {
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
  context?: TargetPlanningContext,
): (ReachableExposedSolid & { requestId: string }) | null {
  const requests = state.accessRequests
    .filter(
      (request) =>
        request.status === 'open' && request.failure !== 'storage-route',
    )
    .sort((first, second) => second.priority - first.priority)

  for (const request of requests) {
    const candidates = getTargetPlanningSnapshot(
      context ?? createTargetPlanningContext(state),
      state,
      dwarf,
    ).reachableCandidates
      .filter(({ target }) => taskKey(target) !== taskKey(request.target))
      .sort(
        (first, second) =>
          distance(first.target, request.target) -
            distance(second.target, request.target) ||
          first.path.length - second.path.length,
      )

    for (const candidate of candidates) {
      if (assessDigSafety(state, candidate.stand, candidate.target).safe) {
        return {
          target: candidate.target,
          path: candidate.path,
          stand: candidate.stand,
          requestId: request.id,
        }
      }
    }
  }

  return null
}

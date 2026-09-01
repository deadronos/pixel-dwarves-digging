import { MAX_OPEN_ACCESS_REQUESTS } from '../content'
import {
  assessDigSafety,
  planAccessConstructionOrder,
  recoverOrphanedAccessOrders,
} from '../logistics'
import { findAdjacentPaths, type ReachableExposedSolid } from '../pathfinding'
import type { AccessRequest, Position, SimulationState } from '../types'
import {
  createTargetPlanningContext,
  findUnsafeTarget,
  getTargetPlanningSnapshot,
  scoreTarget,
  taskKey,
} from './targeting'

export function resolveAccessRequests(state: SimulationState): SimulationState {
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

export function reopenResolvedAccessRequests(
  state: SimulationState,
  context = createTargetPlanningContext(state),
): SimulationState {
  let next = state
  for (const request of state.accessRequests) {
    if (request.status !== 'resolved') continue
    for (const dwarf of state.dwarves) {
      if (dwarf.task.kind !== 'idle' || dwarf.carrying) continue
      const candidate = getTargetPlanningSnapshot(context, state, dwarf)
        .reachableCandidates.find(
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

export function planAccessRequests(
  state: SimulationState,
  context = createTargetPlanningContext(state),
): SimulationState {
  let next = trimOpenAccessRequests(
    reopenResolvedAccessRequests(resolveAccessRequests(state), context),
  )
  let openRequestCount = next.accessRequests.filter(
    (request) => request.status === 'open',
  ).length

  for (const dwarf of next.dwarves) {
    if (openRequestCount >= MAX_OPEN_ACCESS_REQUESTS) break
    if (dwarf.task.kind !== 'idle' || dwarf.carrying) continue
    const unsafe = findUnsafeTarget(next, dwarf, context)
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
    if (existingRequest) continue
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

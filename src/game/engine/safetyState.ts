import {
  BOOTSTRAP_NO_PROGRESS_TICK_LIMIT,
  NO_PROGRESS_TICK_LIMIT,
  STARTER_BOOTSTRAP_CLEAR_COUNT,
} from '../content'
import type { SafetyBlockReason, SafetyPhase, SafetyState } from '../types'
import type { SafetyObservation } from './safetyObservation'

type SafetyEvent = 'unblocked' | 'bootstrap-complete' | 'blocked'

const PHASE_TRANSITIONS: Record<
  SafetyPhase,
  Record<SafetyEvent, SafetyPhase>
> = {
  bootstrap: {
    unblocked: 'bootstrap',
    'bootstrap-complete': 'operational',
    blocked: 'blocked',
  },
  operational: {
    unblocked: 'operational',
    'bootstrap-complete': 'operational',
    blocked: 'blocked',
  },
  blocked: {
    unblocked: 'operational',
    'bootstrap-complete': 'operational',
    blocked: 'blocked',
  },
}

function getBlockReason(
  observation: SafetyObservation,
  stalled: boolean,
): SafetyBlockReason | undefined {
  const {
    work,
    recovery,
    access,
    storageBlock,
    hasMineableSolids,
    hasWaitingConstructionMaterial,
  } = observation

  if (recovery === 'stalled') return 'awaiting-recovery'
  if (work === 'assignable') return undefined

  if (work === 'idle') {
    if (access === 'waiting-for-stone') return 'waiting-for-stone'
    if (hasWaitingConstructionMaterial) return 'waiting-for-material'
    if (recovery === 'waiting') return 'awaiting-recovery'
    if (recovery === 'none' && storageBlock) return storageBlock
    if (access === 'unroutable') return 'no-safe-work'
  }

  if (stalled) {
    if (recovery === 'waiting') return 'awaiting-recovery'
    if (hasMineableSolids) return storageBlock ?? 'no-safe-work'
  }

  return undefined
}

export function transitionSafety(
  previous: SafetyState,
  totalCleared: number,
  observation: SafetyObservation,
): SafetyState {
  const noProgressTicks = previous.noProgressTicks ?? 0
  const bootstrapComplete = totalCleared >= STARTER_BOOTSTRAP_CLEAR_COUNT
  const bootstrapping = previous.phase === 'bootstrap' && !bootstrapComplete
  const timeout = bootstrapping
    ? BOOTSTRAP_NO_PROGRESS_TICK_LIMIT
    : NO_PROGRESS_TICK_LIMIT
  const blockedReason = getBlockReason(observation, noProgressTicks >= timeout)
  const event = blockedReason
    ? 'blocked'
    : bootstrapComplete
      ? 'bootstrap-complete'
      : 'unblocked'

  return {
    phase: PHASE_TRANSITIONS[previous.phase][event],
    emergencyStone: previous.emergencyStone,
    ...(blockedReason && { blockedReason }),
    noProgressTicks,
  }
}

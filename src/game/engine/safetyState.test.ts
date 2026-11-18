import { describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_NO_PROGRESS_TICK_LIMIT,
  NO_PROGRESS_TICK_LIMIT,
  STARTER_BOOTSTRAP_CLEAR_COUNT,
} from '../content'
import type { SafetyBlockReason, SafetyPhase } from '../types'
import type { SafetyObservation } from './safetyObservation'
import { transitionSafety } from './safetyState'

const idle: SafetyObservation = {
  work: 'idle',
  recovery: 'none',
  access: 'none',
  storageBlock: null,
  hasMineableSolids: true,
  hasWaitingConstructionMaterial: false,
}

type TransitionCase = {
  name: string
  from?: SafetyPhase
  to: SafetyPhase
  cleared?: number
  noProgressTicks?: number
  observation?: Partial<SafetyObservation>
  blockedReason?: SafetyBlockReason
}

const cases: TransitionCase[] = [
  {
    name: 'keeps bootstrap protection before the clear threshold',
    from: 'bootstrap',
    to: 'bootstrap',
  },
  {
    name: 'ends bootstrap at the clear threshold',
    from: 'bootstrap',
    to: 'operational',
    cleared: STARTER_BOOTSTRAP_CLEAR_COUNT,
  },
  {
    name: 'returns from blocked to operational when a job is available',
    from: 'blocked',
    to: 'operational',
    observation: { work: 'assignable' },
  },
  {
    name: 'blocks at the shorter bootstrap timeout',
    from: 'bootstrap',
    to: 'blocked',
    noProgressTicks: BOOTSTRAP_NO_PROGRESS_TICK_LIMIT,
    blockedReason: 'no-safe-work',
  },
  {
    name: 'allows the same idle time outside bootstrap',
    to: 'operational',
    noProgressTicks: BOOTSTRAP_NO_PROGRESS_TICK_LIMIT,
  },
  {
    name: 'reports a stalled dwarf even when another dwarf can work',
    to: 'blocked',
    observation: { recovery: 'stalled', work: 'assignable' },
    blockedReason: 'awaiting-recovery',
  },
  {
    name: 'allows recovery with a route to continue',
    from: 'blocked',
    to: 'operational',
    observation: { recovery: 'moving', work: 'active' },
  },
  {
    name: 'reports an unfunded access request ahead of waiting recovery',
    to: 'blocked',
    observation: {
      access: 'waiting-for-stone',
      recovery: 'waiting',
      hasWaitingConstructionMaterial: true,
    },
    blockedReason: 'waiting-for-stone',
  },
  {
    name: 'reports missing construction material',
    to: 'blocked',
    observation: { hasWaitingConstructionMaterial: true },
    blockedReason: 'waiting-for-material',
  },
  {
    name: 'reports waiting recovery when the colony has no other work',
    to: 'blocked',
    observation: { recovery: 'waiting' },
    blockedReason: 'awaiting-recovery',
  },
  {
    name: 'allows other work while an unstalled dwarf waits',
    to: 'operational',
    observation: { recovery: 'waiting', work: 'active' },
  },
  {
    name: 'reports waiting recovery after active work stalls',
    to: 'blocked',
    observation: { recovery: 'waiting', work: 'active' },
    noProgressTicks: NO_PROGRESS_TICK_LIMIT,
    blockedReason: 'awaiting-recovery',
  },
  {
    name: 'reports exhausted storage when it prevents work',
    to: 'blocked',
    observation: { storageBlock: 'storage-full' },
    blockedReason: 'storage-full',
  },
  {
    name: 'reports unreachable storage without claiming it is full',
    to: 'blocked',
    observation: { storageBlock: 'no-safe-work' },
    blockedReason: 'no-safe-work',
  },
  {
    name: 'reports an unreachable access request when nobody can work',
    to: 'blocked',
    observation: { access: 'unroutable' },
    blockedReason: 'no-safe-work',
  },
  {
    name: 'reports no safe work after the ordinary timeout',
    to: 'blocked',
    noProgressTicks: NO_PROGRESS_TICK_LIMIT,
    blockedReason: 'no-safe-work',
  },
  {
    name: 'does not report no safe work on exhausted terrain',
    to: 'operational',
    noProgressTicks: NO_PROGRESS_TICK_LIMIT,
    observation: { hasMineableSolids: false },
  },
]

describe('colony safety transitions', () => {
  it.each(cases)(
    '$name',
    ({
      from = 'operational',
      to,
      cleared = 0,
      noProgressTicks = 0,
      observation,
      blockedReason,
    }) => {
      const result = transitionSafety(
        {
          phase: from,
          emergencyStone: 2,
          noProgressTicks,
          ...(from === 'blocked' && { blockedReason: 'awaiting-recovery' }),
        },
        cleared,
        { ...idle, ...observation },
      )

      expect(result).toEqual({
        phase: to,
        emergencyStone: 2,
        noProgressTicks,
        ...(blockedReason && { blockedReason }),
      })
    },
  )
})

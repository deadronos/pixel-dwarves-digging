import { depositCarriedMaterial, selectStorageDestination } from '../logistics'
import { findPath } from '../pathfinding'
import type { DwarfState, SimulationState } from '../types'
import type { AdvanceResult } from './recovery'
import { attemptEmergencyRecovery } from './recovery'
import { idleTask, invalidateTask, samePosition, unchanged } from './tasks'

export function advanceHaul(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const task = dwarf.task
  if (task.kind !== 'haul') {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
  }

  if (!task.target) {
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

  if (!samePosition(dwarf.position, task.target)) {
    return invalidateTask(state, dwarf)
  }
  if (task.buildingId && task.block) {
    const load = dwarf.carryingCount ?? 1
    let depositedWorld = state.world
    let deposited = 0
    for (let index = 0; index < load; index += 1) {
      const next = depositCarriedMaterial(
        depositedWorld,
        task.buildingId,
        task.block,
      )
      if (!next) break
      depositedWorld = next
      deposited += 1
    }
    if (deposited === 0) {
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
    const remaining = load - deposited
    return {
      dwarf:
        remaining > 0
          ? {
              ...dwarf,
              carrying: task.block,
              carryingCount: remaining,
              task: idleTask(),
            }
          : { ...dwarf, carrying: null, task: idleTask() },
      world: depositedWorld,
      minedBlock: null,
      depositedBlock: task.block,
      depositedCount: deposited,
      progressed: true,
    }
  }

  if (!dwarf.carrying) {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
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

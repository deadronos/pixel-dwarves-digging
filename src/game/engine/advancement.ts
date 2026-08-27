import type { DwarfState, SimulationState } from '../types'
import { advanceBuild } from './buildAdvancement'
import { advanceDig } from './digAdvancement'
import { advanceHaul } from './haulAdvancement'
import { advanceIdle } from './idleAdvancement'
import type { AdvanceResult } from './recovery'
import { attemptEmergencyRecovery, recoveryTask } from './recovery'
import { idleTask, invalidateTask, unchanged, validPath } from './tasks'

function advanceMovement(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const task = dwarf.task
  const movementSteps = Math.min(
    task.path.length,
    1 +
      state.upgrades.moveSpeed +
      (task.kind === 'haul' ? state.upgrades.satchel : 0),
  )
  if (!validPath(state.world, dwarf.position, task.path, movementSteps)) {
    return invalidateTask(state, dwarf)
  }
  return {
    dwarf: {
      ...dwarf,
      position: task.path[movementSteps - 1],
      task: { ...task, path: task.path.slice(movementSteps) },
    },
    world: state.world,
    minedBlock: null,
    progressed: true,
  }
}

export function advanceDwarf(
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
  if (
    task.kind === 'idle' &&
    task.purpose === 'recovery' &&
    task.recoveryReason === 'stranded'
  ) {
    const recovery = attemptEmergencyRecovery(state, dwarf)
    if (recovery) return recovery
  }

  if (task.kind === 'idle') return advanceIdle(state, dwarf)
  if (task.kind === 'haul' && !task.target) return advanceHaul(state, dwarf)
  if (task.path.length > 0) return advanceMovement(state, dwarf)
  if (task.kind === 'build') return advanceBuild(state, dwarf)
  if (task.kind === 'dig') return advanceDig(state, dwarf)
  if (task.kind === 'haul') return advanceHaul(state, dwarf)

  return unchanged({ ...dwarf, task: idleTask() }, state.world)
}

export { recoveryTask }

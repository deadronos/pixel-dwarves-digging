import { consumeConstructionMaterial } from '../buildings'
import { DIG_DURATION } from '../content'
import { clearCell } from '../generation'
import { assessDigSafety } from '../logistics'
import { findPath } from '../pathfinding'
import {
  type DwarfState,
  type Inventory,
  indexFor,
  type SimulationState,
} from '../types'
import type { AdvanceResult } from './recovery'
import { idleTask, invalidateTask, unchanged } from './tasks'

export function advanceDig(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const task = dwarf.task
  if (task.kind !== 'dig' || !task.target) {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
  }

  const target = task.target
  const adjacent =
    Math.max(
      Math.abs(dwarf.position.x - target.x),
      Math.abs(dwarf.position.y - target.y),
    ) === 1
  if (!adjacent) return invalidateTask(state, dwarf)

  const targetCell =
    state.world.cells[indexFor(target.x, target.y, state.world.width)]
  if (targetCell.block === 'air' || targetCell.block === 'bedrock') {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
  }

  const minedBlock = targetCell.block
  const duration = Math.max(
    1,
    DIG_DURATION[minedBlock] - state.upgrades.toolPower * 2,
  )
  const nextProgress = task.progress + 1

  if (duration > 0 && nextProgress >= duration) {
    const safety = assessDigSafety(state, dwarf.position, target)
    if (!safety.safe || !safety.storage) {
      return unchanged({ ...dwarf, task: idleTask() }, state.world)
    }
    const nextWorld = safety.recoveryWorld ?? clearCell(state.world, target)
    const haulTarget = safety.storage.position
    const haulOrigin = safety.landing ?? dwarf.position
    const haulPath = findPath(nextWorld, haulOrigin, haulTarget)
    if (!haulPath) {
      return unchanged({ ...dwarf, task: idleTask() }, state.world)
    }
    const recoveryState = safety.recoveryMaterial
      ? consumeConstructionMaterial(
          { ...state, world: nextWorld },
          safety.recoveryMaterial,
          1,
        )
      : { ...state, world: nextWorld }
    if (!recoveryState) {
      return unchanged({ ...dwarf, task: idleTask() }, state.world)
    }
    return {
      dwarf: {
        ...dwarf,
        position: haulOrigin,
        carrying: minedBlock,
        task: {
          kind: 'haul',
          target: haulTarget,
          path: haulPath,
          progress: 0,
          block: minedBlock,
          buildingId: safety.storage.id,
          ...(safety.landing
            ? {
                purpose: 'recovery' as const,
                recoveryReason: 'stranded' as const,
              }
            : { purpose: 'ordinary' as const }),
        },
      },
      world: recoveryState.world,
      minedBlock,
      inventory: safety.recoveryMaterial ? recoveryState.inventory : undefined,
      progressed: true,
    }
  }

  return {
    dwarf: { ...dwarf, task: { ...task, progress: nextProgress } },
    world: state.world,
    minedBlock: null,
    progressed: true,
  }
}

export type DigInventory = Inventory

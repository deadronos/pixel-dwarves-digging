import { blockAt } from '../blocks'
import { consumeConstructionMaterial } from '../buildings'
import { DIG_DURATION } from '../content'
import { clearCell } from '../generation'
import { assessDigSafety } from '../logistics'
import { findPath } from '../pathfinding'
import { carryCapacity } from '../progression'
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

  const minedBlock = blockAt(
    state.world,
    indexFor(target.x, target.y, state.world.width),
  )
  if (minedBlock === 'air' || minedBlock === 'bedrock') {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
  }

  const duration = Math.max(
    1,
    DIG_DURATION[minedBlock] - state.upgrades.toolPower * 2,
  )
  const nextProgress = task.progress + 1

  if (duration > 0 && nextProgress >= duration) {
    // A loaded dwarf only keeps mining what it already carries; the load is a
    // single material, so anything else goes home first.
    if (dwarf.carrying !== null && dwarf.carrying !== minedBlock) {
      return invalidateTask(state, dwarf)
    }
    const loadCount =
      (dwarf.carrying === minedBlock ? (dwarf.carryingCount ?? 1) : 0) + 1
    const fullLoad = loadCount >= carryCapacity(state)
    const safety = assessDigSafety(state, dwarf.position, target)
    if (!safety.safe || !safety.storage) {
      return unchanged({ ...dwarf, task: idleTask() }, state.world)
    }
    const haulOrigin = safety.landing ?? dwarf.position

    // A straight-down dig drops the dwarf below its route to storage, so the
    // safety pass planned a return ladder. Mine first, then anchor it over a
    // few ticks: the descent stays safe, but it is no longer instant.
    if (safety.ladderPosition && safety.recoveryMaterial) {
      return {
        dwarf: {
          ...dwarf,
          position: haulOrigin,
          carrying: minedBlock,
          carryingCount: loadCount,
          task: {
            kind: 'anchor',
            target: safety.ladderPosition,
            path: [],
            progress: 0,
            block: safety.recoveryMaterial,
          },
        },
        world: clearCell(state.world, target),
        minedBlock,
        progressed: true,
      }
    }

    // Not full yet: drop into idle with the load so targeting can find another
    // block of the same material.
    if (!fullLoad) {
      return {
        dwarf: {
          ...dwarf,
          position: haulOrigin,
          carrying: minedBlock,
          carryingCount: loadCount,
          task: idleTask(),
        },
        world: clearCell(state.world, target),
        minedBlock,
        progressed: true,
      }
    }

    const nextWorld = safety.recoveryWorld ?? clearCell(state.world, target)
    const haulTarget = safety.storage.position
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
        carryingCount: loadCount,
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

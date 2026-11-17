import { canCompleteConstruction, completeConstruction } from '../buildings'
import { BUILD_TICKS_PER_MATERIAL } from '../content'
import type { DwarfState, Inventory, SimulationState } from '../types'
import type { AdvanceResult } from './recovery'
import { idleTask, invalidateTask, samePosition, unchanged } from './tasks'

/**
 * A site is planned until a builder starts work on it. Walking up to it is not
 * enough: the first tick spent building flips it to under-construction so the
 * renderer can tell "nobody has touched this" from "work in progress".
 *
 * Completed buildings are left alone, because storage upgrades deliver
 * materials to a building that is already finished.
 */
function beginConstruction(state: SimulationState, buildingId: string) {
  const building = state.world.buildings.find(
    (candidate) => candidate.id === buildingId,
  )
  if (building?.construction !== 'planned') return state.world
  return {
    ...state.world,
    buildings: state.world.buildings.map((candidate) =>
      candidate.id === buildingId
        ? { ...candidate, construction: 'under-construction' as const }
        : candidate,
    ),
  }
}

export function assignBuildTask(
  state: SimulationState,
  dwarf: DwarfState,
  buildOrder: {
    orderId: string
    path: DwarfState['task']['path']
    stand: NonNullable<DwarfState['task']['target']>
    material: keyof Inventory
  },
): AdvanceResult {
  const order = state.constructionOrders.find(
    ({ id }) => id === buildOrder.orderId,
  )
  return {
    dwarf: {
      ...dwarf,
      carrying: buildOrder.material,
      task: {
        kind: 'build',
        target: buildOrder.stand,
        path: buildOrder.path,
        progress: 0,
        block: buildOrder.material,
        buildingId: order?.buildingId,
        constructionOrderId: buildOrder.orderId,
        purpose: order?.reason === 'access' ? 'access' : 'ordinary',
      },
    },
    world: state.world,
    minedBlock: null,
  }
}

export function advanceBuild(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const task = dwarf.task
  if (task.kind !== 'build' || !task.target || !task.constructionOrderId) {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
  }

  const order = state.constructionOrders.find(
    ({ id }) => id === task.constructionOrderId,
  )
  const material = task.block
  if (!samePosition(dwarf.position, task.target)) {
    return invalidateTask(state, dwarf)
  }
  if (!order || !material || dwarf.carrying !== material) {
    return material && dwarf.carrying === material
      ? invalidateTask(state, dwarf)
      : unchanged({ ...dwarf, carrying: null, task: idleTask() }, state.world)
  }

  if (
    !canCompleteConstruction(
      state.world,
      order.buildingId,
      order.reason === 'storage-upgrade',
    )
  ) {
    return invalidateTask(state, dwarf)
  }

  const delivered = (order.delivered[material] ?? 0) + 1
  const nextProgress = task.progress + 1

  // Work the site before delivering, so a build is visible for a moment.
  if (nextProgress < BUILD_TICKS_PER_MATERIAL) {
    return {
      dwarf: { ...dwarf, task: { ...task, progress: nextProgress } },
      world: beginConstruction(state, order.buildingId),
      minedBlock: null,
      progressed: true,
    }
  }

  const reserved = Math.max(0, (order.reserved[material] ?? 0) - 1)
  const constructionOrders = state.constructionOrders.map((candidate) =>
    candidate.id === order.id
      ? {
          ...candidate,
          delivered: { ...candidate.delivered, [material]: delivered },
          reserved: { ...candidate.reserved, [material]: reserved },
          progress: delivered,
        }
      : candidate,
  )
  const updatedState = { ...state, constructionOrders }
  const completedState = Object.entries(order.required).every(
    ([requiredMaterial, requiredAmount]) =>
      (requiredMaterial === material
        ? delivered
        : (order.delivered[requiredMaterial as keyof Inventory] ?? 0)) >=
      (requiredAmount ?? 0),
  )
    ? completeConstruction(updatedState, order.id)
    : updatedState

  return {
    dwarf: { ...dwarf, carrying: null, task: idleTask() },
    world: completedState.world,
    minedBlock: null,
    constructionOrders: completedState.constructionOrders,
    progressed: true,
  }
}

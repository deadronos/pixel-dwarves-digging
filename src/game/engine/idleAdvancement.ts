import { reserveConstructionMaterials } from '../buildings'
import { selectStorageDestination } from '../logistics'
import { findPath } from '../pathfinding'
import type {
  ConstructionOrder,
  DwarfState,
  Inventory,
  SimulationState,
} from '../types'
import { assignBuildTask } from './buildAdvancement'
import type { AdvanceResult } from './recovery'
import { attemptEmergencyRecovery, recoveryTask } from './recovery'
import { chooseAccessTarget, chooseTarget } from './targeting'
import { chooseBuildOrder, unchanged } from './tasks'

export function advanceIdle(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  if (dwarf.carrying) {
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
            kind: 'haul',
            target: destination.position,
            path,
            progress: 0,
            block: dwarf.carrying,
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
        { ...dwarf, task: recoveryTask(dwarf, 'storage-route') },
        state.world,
      )
    )
  }

  const buildOrder = chooseBuildOrder(state, dwarf)
  if (buildOrder) return assignBuildTask(state, dwarf, buildOrder)

  const ordersNeedingMaterials = state.constructionOrders
    .filter((order) => {
      const building = state.world.buildings.find(
        ({ id }) => id === order.buildingId,
      )
      return (
        building !== undefined &&
        (building.construction !== 'completed' ||
          order.reason === 'storage-upgrade') &&
        Object.keys(order.required).some((material) => {
          const key = material as keyof Inventory
          const required = order.required[key] ?? 0
          const delivered = order.delivered[key] ?? 0
          const reserved = order.reserved[key] ?? 0
          return delivered < required && reserved < required - delivered
        })
      )
    })
    .sort((first, second) => {
      const rank = (reason: ConstructionOrder['reason']) =>
        reason === 'access'
          ? 0
          : reason === 'capacity' || reason === 'storage-upgrade'
            ? 1
            : 2
      return rank(first.reason) - rank(second.reason)
    })
  for (const orderNeedingMaterials of ordersNeedingMaterials) {
    const reservedState = reserveConstructionMaterials(
      state,
      orderNeedingMaterials.id,
    )
    const reservedBuild = chooseBuildOrder(
      reservedState,
      dwarf,
      orderNeedingMaterials.id,
    )
    if (reservedBuild) {
      return {
        ...assignBuildTask(reservedState, dwarf, reservedBuild),
        inventory: reservedState.inventory,
        constructionOrders: reservedState.constructionOrders,
      }
    }
  }

  const accessAssignment = chooseAccessTarget(state, dwarf)
  if (accessAssignment) {
    return {
      dwarf: {
        ...dwarf,
        task: {
          kind: 'dig',
          target: accessAssignment.target,
          path: accessAssignment.path,
          progress: 0,
          purpose: 'access',
          accessRequestId: accessAssignment.requestId,
        },
      },
      world: state.world,
      minedBlock: null,
    }
  }

  const assignment = chooseTarget(state, dwarf)
  return assignment
    ? {
        dwarf: {
          ...dwarf,
          task: {
            kind: 'dig',
            target: assignment.target,
            path: assignment.path,
            progress: 0,
            purpose: 'ordinary',
          },
        },
        world: state.world,
        minedBlock: null,
      }
    : unchanged(dwarf, state.world)
}

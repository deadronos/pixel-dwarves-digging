import { canCompleteConstruction, returnMaterialToStorage } from '../buildings'
import type { ConstructionOrder, Inventory, SimulationState } from '../types'
import { hasActiveBuilder, hasReachableConstructionSite } from './storage'

export function returnOrderMaterials(
  state: SimulationState,
  order: ConstructionOrder,
): SimulationState | null {
  let next = state
  for (const material of Object.keys(order.required) as Array<
    keyof Inventory
  >) {
    const amount =
      (order.reserved[material] ?? 0) + (order.delivered[material] ?? 0)
    for (let count = 0; count < amount; count += 1) {
      const returned = returnMaterialToStorage(next.world, material)
      if (!returned.stored) return null
      next = {
        ...next,
        world: returned.world,
        inventory: {
          ...next.inventory,
          [material]: next.inventory[material] + 1,
        },
      }
    }
  }
  return next
}

export function removeRecoveredConstructionOrder(
  state: SimulationState,
  order: ConstructionOrder,
): SimulationState | null {
  const returned = returnOrderMaterials(state, order)
  if (!returned) return null

  return {
    ...returned,
    // Carried construction material is already counted in the reservation.
    dwarves: returned.dwarves.map((dwarf) =>
      dwarf.task.kind === 'build' && dwarf.task.constructionOrderId === order.id
        ? {
            ...dwarf,
            carrying: null,
            carryingCount: undefined,
            task: { kind: 'idle', path: [], progress: 0 },
          }
        : dwarf,
    ),
    world: {
      ...returned.world,
      buildings: returned.world.buildings.filter(
        (building) => building.id !== order.buildingId,
      ),
    },
    constructionOrders: returned.constructionOrders.filter(
      (candidate) => candidate.id !== order.id,
    ),
  }
}

export function recoverStaleStorageOrders(
  state: SimulationState,
): SimulationState {
  let next = state
  for (const order of state.constructionOrders) {
    if (order.reason !== 'outpost' && order.reason !== 'capacity') continue
    const building = next.world.buildings.find(
      ({ id }) => id === order.buildingId,
    )
    if (building?.construction === 'completed') continue
    const invalid = !canCompleteConstruction(next.world, order.buildingId)
    const unreachableOutpost =
      order.reason === 'outpost' &&
      building?.construction === 'planned' &&
      !hasActiveBuilder(next, building.id) &&
      !hasReachableConstructionSite(next, building.position)
    if (invalid || unreachableOutpost) {
      next = removeRecoveredConstructionOrder(next, order) ?? next
    }
  }
  return next
}

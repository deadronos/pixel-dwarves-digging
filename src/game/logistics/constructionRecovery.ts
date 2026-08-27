import { returnMaterialToStorage } from '../buildings'
import type { ConstructionOrder, Inventory, SimulationState } from '../types'

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

import type { BuildingState, Inventory, MineableBlockType, World } from '../types'

export function storedCount(inventory: Partial<Inventory>): number {
  return Object.values(inventory).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  )
}

export function findStorageWithCapacity(
  world: World,
  buildingId?: string,
): BuildingState | null {
  return (
    world.buildings.find(
      (building) =>
        (!buildingId || building.id === buildingId) &&
        building.construction === 'completed' &&
        building.storage !== undefined &&
        storedCount(building.storage.inventory) < building.storage.capacity,
    ) ?? null
  )
}

export function addMaterialToStorage(
  world: World,
  buildingId: string,
  material: MineableBlockType,
): World | null {
  const destination = findStorageWithCapacity(world, buildingId)
  if (!destination?.storage) return null

  return {
    ...world,
    buildings: world.buildings.map((building) =>
      building.id === destination.id && building.storage
        ? {
            ...building,
            storage: {
              ...building.storage,
              inventory: {
                ...building.storage.inventory,
                [material]: (building.storage.inventory[material] ?? 0) + 1,
              },
            },
          }
        : building,
    ),
  }
}

export function removeFromStorage(
  world: World,
  material: keyof Inventory,
  amount: number,
): World {
  let remaining = amount
  return {
    ...world,
    buildings: world.buildings.map((building) => {
      if (!building.storage || remaining <= 0) return building
      const stored = building.storage.inventory[material] ?? 0
      const removed = Math.min(stored, remaining)
      remaining -= removed
      return {
        ...building,
        storage: {
          ...building.storage,
          inventory: {
            ...building.storage.inventory,
            [material]: stored - removed,
          },
        },
      }
    }),
  }
}

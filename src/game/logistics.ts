import { findPath } from './pathfinding'
import {
  cloneInventory,
  type Inventory,
  type MineableBlockType,
  type Position,
  type SimulationState,
  type World,
} from './types'

export type StorageDestination = {
  id: string
  position: Position
}

function storageBuildings(world: World) {
  return world.buildings.filter(
    (building) => building.construction === 'completed' && building.storage,
  )
}

function storedCount(inventory: Partial<Inventory>): number {
  return Object.values(inventory).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  )
}

export function getAggregateInventory(state: SimulationState): Inventory {
  const aggregate = cloneInventory(state.inventory)
  for (const dwarf of state.dwarves) {
    if (dwarf.carrying) aggregate[dwarf.carrying] += 1
  }
  return aggregate
}

export function getAvailableCapacity(
  world: World,
  buildingId?: string,
): number {
  return storageBuildings(world)
    .filter((building) => !buildingId || building.id === buildingId)
    .reduce(
      (total, building) =>
        total +
        (building.storage?.capacity ?? 0) -
        storedCount(building.storage?.inventory ?? {}),
      0,
    )
}

export function selectStorageDestination(
  state: SimulationState,
  _block: MineableBlockType,
  from: Position,
): StorageDestination | null {
  const candidates = storageBuildings(state.world)
    .filter((building) => getAvailableCapacity(state.world, building.id) > 0)
    .map((building) => ({
      building,
      path: findPath(state.world, from, building.position),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        building: (typeof state.world.buildings)[number]
        path: Position[]
      } => candidate.path !== null,
    )
    .sort((first, second) => first.path.length - second.path.length)

  const selected = candidates[0]
  return selected
    ? { id: selected.building.id, position: selected.building.position }
    : null
}

export function depositCarriedMaterial(
  world: World,
  buildingId: string,
  block: MineableBlockType,
): World | null {
  const building = storageBuildings(world).find(({ id }) => id === buildingId)
  if (!building?.storage) return null
  if (storedCount(building.storage.inventory) >= building.storage.capacity) {
    return null
  }

  return {
    ...world,
    buildings: world.buildings.map((candidate) => {
      if (candidate.id !== buildingId || !candidate.storage) return candidate
      return {
        ...candidate,
        storage: {
          ...candidate.storage,
          inventory: {
            ...candidate.storage.inventory,
            [block]: (candidate.storage.inventory[block] ?? 0) + 1,
          },
        },
      }
    }),
  }
}

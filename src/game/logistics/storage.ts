import { getPrimaryStockpile } from '../buildings'
import {
  COMMON_BUILDING_MATERIALS,
  getEmergencyReserveMaterial,
  MAX_DEPOTS_PER_STOCKPILE,
} from '../content'
import { findAdjacentConstructionPaths, findPath } from '../pathfinding'
import {
  cloneInventory,
  type BuildingState,
  type CommonBuildingMaterial,
  type Inventory,
  type MineableBlockType,
  type Position,
  type SimulationState,
  type World,
} from '../types'

export type StorageDestination = {
  id: string
  position: Position
}

export function storageBuildings(world: World): BuildingState[] {
  return world.buildings.filter(
    (building) => building.construction === 'completed' && building.storage,
  )
}

export function getDepotLimit(world: World): number {
  const stockpileCount = world.buildings.filter(
    (building) =>
      building.type === 'stockpile' && building.construction === 'completed',
  ).length
  return stockpileCount * MAX_DEPOTS_PER_STOCKPILE
}

export function canPlanAdditionalDepot(world: World): boolean {
  const depotLimit = getDepotLimit(world)
  if (depotLimit === 0) return false

  const depotCount = world.buildings.filter(
    (building) => building.type === 'depot',
  ).length
  return depotCount < depotLimit
}

export function getAvailableConstructionMaterial(
  state: SimulationState,
  material: keyof Inventory,
): number {
  const reserveMaterial = getEmergencyReserveMaterial(state.inventory)
  const reserve = material === reserveMaterial ? state.safety.emergencyStone : 0
  const promised = state.constructionOrders.reduce(
    (total, order) =>
      total +
      Math.max(
        0,
        (order.required[material] ?? 0) -
          (order.delivered[material] ?? 0) -
          (order.reserved[material] ?? 0),
      ),
    0,
  )
  return Math.max(0, (state.inventory[material] ?? 0) - reserve - promised)
}

export function chooseCommonConstructionMaterial(
  state: SimulationState,
  amount: number,
): CommonBuildingMaterial | null {
  return (
    COMMON_BUILDING_MATERIALS.find(
      (material) => getAvailableConstructionMaterial(state, material) >= amount,
    ) ?? null
  )
}

export function storagePerimeterCandidates(
  building: Pick<BuildingState, 'position' | 'width' | 'height'>,
): Position[] {
  const candidates: Position[] = []
  for (
    let x = building.position.x;
    x < building.position.x + building.width;
    x += 1
  ) {
    candidates.push(
      { x, y: building.position.y - 1 },
      { x, y: building.position.y + building.height },
    )
  }
  for (
    let y = building.position.y;
    y < building.position.y + building.height;
    y += 1
  ) {
    candidates.push(
      { x: building.position.x - 1, y },
      { x: building.position.x + building.width, y },
    )
  }
  return candidates.filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) => other.x === candidate.x && other.y === candidate.y,
      ) === index,
  )
}

export function hasReachableConstructionSite(
  state: SimulationState,
  position: Position,
): boolean {
  for (const building of storageBuildings(state.world)) {
    if (
      findAdjacentConstructionPaths(state.world, building.position, position)
        .length > 0
    ) {
      return true
    }
  }
  for (const dwarf of state.dwarves) {
    if (
      findAdjacentConstructionPaths(state.world, dwarf.position, position)
        .length > 0
    ) {
      return true
    }
  }
  return false
}

export function hasActiveBuilder(
  state: SimulationState,
  buildingId: string,
): boolean {
  return state.dwarves.some(
    (dwarf) =>
      dwarf.task.kind === 'build' && dwarf.task.buildingId === buildingId,
  )
}

export function hasReachableBuilder(
  state: SimulationState,
  position: Position,
): boolean {
  return state.dwarves.some(
    (dwarf) =>
      findAdjacentConstructionPaths(state.world, dwarf.position, position)
        .length > 0,
  )
}

export function storedCount(inventory: Partial<Inventory>): number {
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

export function getReservedStorageCapacity(
  state: SimulationState,
  buildingId?: string,
  excludeDwarfId?: string,
): number {
  return state.dwarves.filter(
    (dwarf) =>
      dwarf.id !== excludeDwarfId &&
      dwarf.carrying !== null &&
      dwarf.task.kind === 'haul' &&
      dwarf.task.target !== undefined &&
      (!buildingId || dwarf.task.buildingId === buildingId),
  ).length
}

export function getAvailableStateCapacity(
  state: SimulationState,
  buildingId?: string,
  excludeDwarfId?: string,
): number {
  return Math.max(
    0,
    getAvailableCapacity(state.world, buildingId) -
      getReservedStorageCapacity(state, buildingId, excludeDwarfId),
  )
}

export function hasReachableStorage(state: SimulationState): boolean {
  return state.dwarves.some(
    (dwarf) =>
      selectStorageDestination(state, 'stone', dwarf.position, dwarf.id) !==
      null,
  )
}

export function selectStorageDestination(
  state: SimulationState,
  _block: MineableBlockType,
  from: Position,
  excludeDwarfId?: string,
  cleared?: Position,
): StorageDestination | null {
  const primaryStockpileId = getPrimaryStockpile(state.world)?.id
  const currentRouteBuildingId = excludeDwarfId
    ? (() => {
        const dwarf = state.dwarves.find(({ id }) => id === excludeDwarfId)
        return dwarf?.task.kind === 'haul' ? dwarf.task.buildingId : undefined
      })()
    : undefined
  const candidates = storageBuildings(state.world)
    .filter(
      (building) =>
        getAvailableStateCapacity(state, building.id, excludeDwarfId) > 0,
    )
    .map((building) => ({
      building,
      path: findPath(state.world, from, building.position, cleared),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        building: (typeof state.world.buildings)[number]
        path: Position[]
      } => candidate.path !== null,
    )
    .sort((first, second) => {
      if (state.policy.haulingPreference === 'finish-current-route') {
        const firstCurrent = first.building.id === currentRouteBuildingId
        const secondCurrent = second.building.id === currentRouteBuildingId
        if (firstCurrent !== secondCurrent) return firstCurrent ? -1 : 1
      }

      if (state.policy.haulingPreference === 'nearest-stockpile') {
        const firstPrimary = first.building.id === primaryStockpileId
        const secondPrimary = second.building.id === primaryStockpileId
        if (firstPrimary !== secondPrimary) return firstPrimary ? -1 : 1
      }

      return first.path.length - second.path.length
    })

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

import type { BuildingState, World } from '../types'

export function getBuildingById(
  world: World,
  buildingId: string,
): BuildingState | null {
  return world.buildings.find(({ id }) => id === buildingId) ?? null
}

export function getCompletedStorageBuildings(world: World): BuildingState[] {
  return world.buildings.filter(
    (building) => building.construction === 'completed' && building.storage,
  )
}

export function getCompletedBuildingByType(
  world: World,
  type: BuildingState['type'],
): BuildingState | null {
  return (
    world.buildings.find(
      (building) =>
        building.type === type && building.construction === 'completed',
    ) ?? null
  )
}

export function hasCompletedBuildingType(
  world: World,
  type: BuildingState['type'],
): boolean {
  return world.buildings.some(
    (building) =>
      building.type === type && building.construction === 'completed',
  )
}

import { canPlaceBuilding } from '../buildings'
import {
  BUILDING_DEFINITIONS,
  MAX_STORAGE_LEVEL,
  OVERFLOW_DEPOT_TRIGGER_CAPACITY,
  STORAGE_UPGRADE_COST,
} from '../content'
import type { BuildingType, Position, SimulationState } from '../types'
import { getExpansionEligibility } from './expansionEligibility'
import {
  canPlanAdditionalDepot,
  getAvailableCapacity,
  getAvailableConstructionMaterial,
  hasReachableConstructionSite,
  storageBuildings,
  storagePerimeterCandidates,
} from './storage'

export type ConstructionSiteInspection = {
  placeableCandidate?: Position
  reachableCandidate?: Position
}

export function inspectConstructionSites(
  state: SimulationState,
  type: 'depot' | 'outpost',
  candidates: Position[],
): ConstructionSiteInspection {
  let placeableCandidate: Position | undefined
  let reachableCandidate: Position | undefined
  for (const position of candidates) {
    if (!canPlaceBuilding(state.world, { type, position })) continue
    placeableCandidate ??= position
    if (!reachableCandidate && hasReachableConstructionSite(state, position)) {
      reachableCandidate = position
      break
    }
  }
  return { placeableCandidate, reachableCandidate }
}

export function outpostCandidatePositions(state: SimulationState): Position[] {
  return Array.from(
    { length: Math.max(0, state.world.width - state.world.start.x - 4) },
    (_, index) => ({
      x: state.world.start.x + 3 + index,
      y: state.world.start.y,
    }),
  )
}

export function appendPlannedConstruction(
  state: SimulationState,
  type: 'depot' | 'outpost',
  position: Position,
): SimulationState {
  const definition = BUILDING_DEFINITIONS[type]
  const buildingId = `${type}-${state.world.buildings.length + 1}`
  const reason = type === 'depot' ? 'capacity' : 'outpost'
  return {
    ...state,
    world: {
      ...state.world,
      buildings: [
        ...state.world.buildings,
        {
          id: buildingId,
          type,
          position,
          width: definition.width,
          height: definition.height,
          level: 1,
          construction: 'planned' as const,
        },
      ],
    },
    constructionOrders: [
      ...state.constructionOrders,
      {
        id: `${buildingId}-order`,
        buildingId,
        type,
        required: { stone: definition.stone ?? 0 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason,
      },
    ],
  }
}

export function planExpansionOrder(state: SimulationState): SimulationState {
  const eligibility = getExpansionEligibility(state)
  if (state.constructionPolicy === 'conserve') return state
  if (
    state.world.buildings.some((building) => building.type === 'outpost') ||
    eligibility.hasPendingOutpostOrder
  ) {
    return state
  }

  if (
    state.constructionOrders.some(
      (order) =>
        order.reason === 'capacity' || order.reason === 'storage-upgrade',
    )
  ) {
    return state
  }

  const requiredStone = BUILDING_DEFINITIONS.outpost.stone
  if (eligibility.availableStone < requiredStone) return state

  const site = inspectConstructionSites(
    state,
    'outpost',
    outpostCandidatePositions(state),
  ).reachableCandidate
  return site ? appendPlannedConstruction(state, 'outpost', site) : state
}

export function planOverflowDepotOrder(
  state: SimulationState,
): SimulationState {
  const eligibility = getExpansionEligibility(state)
  if (eligibility.availableCapacity > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
    return state
  }
  if (!canPlanAdditionalDepot(state.world) || eligibility.hasPendingDepot) {
    return state
  }

  const definition = BUILDING_DEFINITIONS.depot
  if (eligibility.availableStone < definition.stone) return state

  const site = inspectConstructionSites(
    state,
    'depot',
    storageBuildings(state.world).flatMap(storagePerimeterCandidates),
  ).reachableCandidate
  return site ? appendPlannedConstruction(state, 'depot', site) : state
}

export function planStorageUpgradeOrder(
  state: SimulationState,
): SimulationState {
  const eligibility = getExpansionEligibility(state)
  if (state.constructionPolicy === 'conserve') return state
  if (
    state.safety.phase === 'blocked' &&
    state.safety.blockedReason !== 'storage-full'
  ) {
    return state
  }
  if (eligibility.availableCapacity > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
    return state
  }
  if (
    state.constructionOrders.some(
      (order) =>
        order.reason === 'capacity' || eligibility.hasPendingStorageUpgrade,
    )
  ) {
    return state
  }
  if (eligibility.availableStone < STORAGE_UPGRADE_COST) return state

  const building = storageBuildings(state.world).find(
    (candidate) => candidate.level < MAX_STORAGE_LEVEL,
  )
  if (!building) return state

  const targetLevel = building.level + 1
  const orderId = `${building.id}-storage-upgrade-${targetLevel}`
  return {
    ...state,
    constructionOrders: [
      ...state.constructionOrders,
      {
        id: orderId,
        buildingId: building.id,
        type: building.type,
        required: { stone: STORAGE_UPGRADE_COST },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'storage-upgrade',
        targetLevel,
      },
    ],
  }
}

export function planEmergencyCapacityOrder(
  state: SimulationState,
): SimulationState {
  if (
    state.safety.phase !== 'blocked' ||
    state.safety.blockedReason !== 'storage-full'
  ) {
    return state
  }

  return planExpansionOrder(
    planStorageUpgradeOrder(planOverflowDepotOrder(state)),
  )
}

export type ExpansionBuildingType = BuildingType

export { getAvailableCapacity, getAvailableConstructionMaterial }

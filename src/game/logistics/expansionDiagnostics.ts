import {
  BUILDING_DEFINITIONS,
  MAX_STORAGE_LEVEL,
  OVERFLOW_DEPOT_TRIGGER_CAPACITY,
  STORAGE_UPGRADE_COST,
} from '../content'
import type { BuildingType, Position, SimulationState, World } from '../types'
import { getExpansionEligibility } from './expansionEligibility'
import {
  inspectConstructionSites,
  outpostCandidatePositions,
} from './expansionPlanning'
import {
  canPlanAdditionalDepot,
  getAvailableCapacity,
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  getDepotLimit,
  getReservedStorageCapacity,
  storageBuildings,
  storagePerimeterCandidates,
  storedCount,
} from './storage'

export type StorageExpansionDiagnostic = {
  kind: 'depot' | 'storage-upgrade' | 'outpost'
  reason:
    | 'available'
    | 'capacity-not-low'
    | 'depot-limit'
    | 'pending-order'
    | 'existing-outpost'
    | 'policy-disabled'
    | 'insufficient-stone'
    | 'no-storage'
    | 'max-level'
    | 'no-placement'
    | 'no-builder-route'
    | 'blocked-state'
  candidate?: Position
}

export type StorageDiagnostics = {
  totalCapacity: number
  occupiedCapacity: number
  availableCapacity: number
  reservedCapacity: number
  stateAvailableCapacity: number
  depotLimit: number
  completedDepots: number
  buildings: Array<{
    id: string
    type: BuildingType
    level: number
    capacity: number
    occupied: number
    available: number
  }>
  expansion: StorageExpansionDiagnostic[]
}

const storageExpansionCache = new WeakMap<
  World,
  Map<string, StorageExpansionDiagnostic[]>
>()

function storageExpansionKey(state: SimulationState): string {
  const availableCapacity = getAvailableCapacity(state.world)
  const availableStone = getAvailableConstructionMaterial(state, 'stone')
  const ordersSignature = state.constructionOrders
    .map(
      (order) =>
        `${order.id}:${order.type}:${order.reason}:${order.buildingId ?? ''}`,
    )
    .sort()
    .join('|')
  const dwarfSignature = state.dwarves
    .map((dwarf) => `${dwarf.position.x},${dwarf.position.y}`)
    .sort()
    .join('|')

  return `${state.constructionPolicy}|${state.safety.phase}|${state.safety.blockedReason ?? ''}|${availableCapacity}|${availableStone}|${ordersSignature}|${dwarfSignature}`
}

function explainConstructionSites(
  state: SimulationState,
  type: 'depot' | 'outpost',
  candidates: Position[],
): StorageExpansionDiagnostic {
  const inspection = inspectConstructionSites(state, type, candidates)
  return inspection.reachableCandidate
    ? {
        kind: type,
        reason: 'available',
        candidate: inspection.reachableCandidate,
      }
    : {
        kind: type,
        reason: inspection.placeableCandidate
          ? 'no-builder-route'
          : 'no-placement',
        candidate: inspection.placeableCandidate,
      }
}

export function getStorageExpansionDiagnostics(
  state: SimulationState,
): StorageExpansionDiagnostic[] {
  const eligibility = getExpansionEligibility(state)
  let worldCache = storageExpansionCache.get(state.world)
  if (!worldCache) {
    worldCache = new Map()
    storageExpansionCache.set(state.world, worldCache)
  }

  const key = storageExpansionKey(state)
  const cached = worldCache.get(key)
  if (cached) return cached

  const availableCapacity = eligibility.availableCapacity
  const expansion: StorageExpansionDiagnostic[] = []

  if (availableCapacity > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
    expansion.push({ kind: 'depot', reason: 'capacity-not-low' })
  } else if (!canPlanAdditionalDepot(state.world)) {
    expansion.push({ kind: 'depot', reason: 'depot-limit' })
  } else if (state.constructionOrders.some((order) => order.type === 'depot')) {
    expansion.push({ kind: 'depot', reason: 'pending-order' })
  } else if (eligibility.availableStone < BUILDING_DEFINITIONS.depot.stone) {
    expansion.push({ kind: 'depot', reason: 'insufficient-stone' })
  } else {
    expansion.push(
      explainConstructionSites(
        state,
        'depot',
        storageBuildings(state.world).flatMap(storagePerimeterCandidates),
      ),
    )
  }

  if (availableCapacity > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
    expansion.push({ kind: 'storage-upgrade', reason: 'capacity-not-low' })
  } else if (
    state.constructionOrders.some((order) => order.reason === 'storage-upgrade')
  ) {
    expansion.push({ kind: 'storage-upgrade', reason: 'pending-order' })
  } else if (
    !storageBuildings(state.world).some(
      (building) => building.level < MAX_STORAGE_LEVEL,
    )
  ) {
    expansion.push({ kind: 'storage-upgrade', reason: 'max-level' })
  } else if (eligibility.availableStone < STORAGE_UPGRADE_COST) {
    expansion.push({ kind: 'storage-upgrade', reason: 'insufficient-stone' })
  } else {
    expansion.push({
      kind: 'storage-upgrade',
      reason: 'available',
      candidate: storageBuildings(state.world).find(
        (building) => building.level < MAX_STORAGE_LEVEL,
      )?.position,
    })
  }

  const outpostCandidates = outpostCandidatePositions(state)
  if (state.constructionPolicy === 'conserve') {
    expansion.push({ kind: 'outpost', reason: 'policy-disabled' })
  } else if (
    state.world.buildings.some((building) => building.type === 'outpost') ||
    state.constructionOrders.some((order) => order.type === 'outpost')
  ) {
    expansion.push({ kind: 'outpost', reason: 'existing-outpost' })
  } else if (
    state.safety.phase === 'blocked' &&
    state.safety.blockedReason !== 'storage-full'
  ) {
    expansion.push({ kind: 'outpost', reason: 'blocked-state' })
  } else if (eligibility.availableStone < BUILDING_DEFINITIONS.outpost.stone) {
    expansion.push({ kind: 'outpost', reason: 'insufficient-stone' })
  } else {
    expansion.push(
      explainConstructionSites(state, 'outpost', outpostCandidates),
    )
  }

  worldCache.set(key, expansion)
  return expansion
}

export function getStorageDiagnostics(
  state: SimulationState,
): StorageDiagnostics {
  const buildings = storageBuildings(state.world).map((building) => {
    const capacity = building.storage?.capacity ?? 0
    const occupied = storedCount(building.storage?.inventory ?? {})
    return {
      id: building.id,
      type: building.type,
      level: building.level,
      capacity,
      occupied,
      available: Math.max(0, capacity - occupied),
    }
  })
  const totalCapacity = buildings.reduce(
    (total, building) => total + building.capacity,
    0,
  )
  const availableCapacity = getAvailableCapacity(state.world)
  const completedDepots = state.world.buildings.filter(
    (building) =>
      building.type === 'depot' && building.construction === 'completed',
  ).length

  return {
    totalCapacity,
    occupiedCapacity: Math.max(0, totalCapacity - availableCapacity),
    availableCapacity,
    reservedCapacity: getReservedStorageCapacity(state),
    stateAvailableCapacity: getAvailableStateCapacity(state),
    depotLimit: getDepotLimit(state.world),
    completedDepots,
    buildings,
    expansion: getStorageExpansionDiagnostics(state),
  }
}

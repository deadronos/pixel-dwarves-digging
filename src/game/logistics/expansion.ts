import { canPlaceBuilding } from '../buildings'
import {
  BUILDING_DEFINITIONS,
  MAX_STORAGE_LEVEL,
  OVERFLOW_DEPOT_TRIGGER_CAPACITY,
  STORAGE_UPGRADE_COST,
} from '../content'
import type { BuildingType, Position, SimulationState, World } from '../types'
import {
  canPlanAdditionalDepot,
  getAvailableCapacity,
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  getDepotLimit,
  getReservedStorageCapacity,
  hasReachableConstructionSite,
  storageBuildings,
  storagePerimeterCandidates,
  storedCount,
} from './storage'

export function planExpansionOrder(state: SimulationState): SimulationState {
  if (state.constructionPolicy === 'conserve') return state
  if (
    state.world.buildings.some((building) => building.type === 'outpost') ||
    state.constructionOrders.some((order) => order.type === 'outpost')
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
  if (getAvailableConstructionMaterial(state, 'stone') < requiredStone) {
    return state
  }

  for (let x = state.world.start.x + 3; x < state.world.width - 1; x += 1) {
    const position = { x, y: state.world.start.y }
    if (!canPlaceBuilding(state.world, { type: 'outpost', position })) continue
    if (!hasReachableConstructionSite(state, position)) continue

    const buildingId = `outpost-${state.world.buildings.length + 1}`
    const orderId = `${buildingId}-order`
    return {
      ...state,
      world: {
        ...state.world,
        buildings: [
          ...state.world.buildings,
          {
            id: buildingId,
            type: 'outpost',
            position,
            width: BUILDING_DEFINITIONS.outpost.width,
            height: BUILDING_DEFINITIONS.outpost.height,
            level: 1,
            construction: 'planned',
          },
        ],
      },
      constructionOrders: [
        ...state.constructionOrders,
        {
          id: orderId,
          buildingId,
          type: 'outpost',
          required: { stone: requiredStone },
          reserved: {},
          delivered: {},
          progress: 0,
          reason: 'outpost',
        },
      ],
    }
  }

  return state
}

export function planOverflowDepotOrder(
  state: SimulationState,
): SimulationState {
  if (getAvailableCapacity(state.world) > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
    return state
  }
  if (
    !canPlanAdditionalDepot(state.world) ||
    state.constructionOrders.some((order) => order.type === 'depot')
  ) {
    return state
  }

  const definition = BUILDING_DEFINITIONS.depot
  if (getAvailableConstructionMaterial(state, 'stone') < definition.stone) {
    return state
  }

  const candidates = storageBuildings(state.world).flatMap(
    storagePerimeterCandidates,
  )

  for (const position of candidates) {
    if (!canPlaceBuilding(state.world, { type: 'depot', position })) continue
    if (!hasReachableConstructionSite(state, position)) continue

    const buildingId = `depot-${state.world.buildings.length + 1}`
    return {
      ...state,
      world: {
        ...state.world,
        buildings: [
          ...state.world.buildings,
          {
            id: buildingId,
            type: 'depot',
            position,
            width: definition.width,
            height: definition.height,
            level: 1,
            construction: 'planned',
          },
        ],
      },
      constructionOrders: [
        ...state.constructionOrders,
        {
          id: `${buildingId}-order`,
          buildingId,
          type: 'depot',
          required: { stone: definition.stone },
          reserved: {},
          delivered: {},
          progress: 0,
          reason: 'capacity',
        },
      ],
    }
  }

  return state
}

export function planStorageUpgradeOrder(
  state: SimulationState,
): SimulationState {
  if (state.constructionPolicy === 'conserve') return state
  if (
    state.safety.phase === 'blocked' &&
    state.safety.blockedReason !== 'storage-full'
  ) {
    return state
  }
  if (getAvailableCapacity(state.world) > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
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
  if (getAvailableConstructionMaterial(state, 'stone') < STORAGE_UPGRADE_COST) {
    return state
  }

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
  let placeableCandidate: Position | undefined
  for (const position of candidates) {
    if (!canPlaceBuilding(state.world, { type, position })) continue
    placeableCandidate ??= position
    if (hasReachableConstructionSite(state, position)) {
      return { kind: type, reason: 'available', candidate: position }
    }
  }
  return {
    kind: type,
    reason: placeableCandidate ? 'no-builder-route' : 'no-placement',
    candidate: placeableCandidate,
  }
}

export function getStorageExpansionDiagnostics(
  state: SimulationState,
): StorageExpansionDiagnostic[] {
  let worldCache = storageExpansionCache.get(state.world)
  if (!worldCache) {
    worldCache = new Map()
    storageExpansionCache.set(state.world, worldCache)
  }

  const key = storageExpansionKey(state)
  const cached = worldCache.get(key)
  if (cached) return cached

  const availableCapacity = getAvailableCapacity(state.world)
  const expansion: StorageExpansionDiagnostic[] = []

  if (availableCapacity > OVERFLOW_DEPOT_TRIGGER_CAPACITY) {
    expansion.push({ kind: 'depot', reason: 'capacity-not-low' })
  } else if (!canPlanAdditionalDepot(state.world)) {
    expansion.push({ kind: 'depot', reason: 'depot-limit' })
  } else if (state.constructionOrders.some((order) => order.type === 'depot')) {
    expansion.push({ kind: 'depot', reason: 'pending-order' })
  } else if (
    getAvailableConstructionMaterial(state, 'stone') <
    BUILDING_DEFINITIONS.depot.stone
  ) {
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
  } else if (
    getAvailableConstructionMaterial(state, 'stone') < STORAGE_UPGRADE_COST
  ) {
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

  const outpostCandidates = Array.from(
    { length: Math.max(0, state.world.width - state.world.start.x - 4) },
    (_, index) => ({
      x: state.world.start.x + 3 + index,
      y: state.world.start.y,
    }),
  )
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
  } else if (
    getAvailableConstructionMaterial(state, 'stone') <
    BUILDING_DEFINITIONS.outpost.stone
  ) {
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

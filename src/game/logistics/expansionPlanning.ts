import { getBlock } from '../blocks'
import {
  canPlaceBuilding,
  getPrimaryStockpile,
  reserveConstructionMaterials,
} from '../buildings'
import {
  BUILDING_DEFINITIONS,
  FRONTIER_DEPOT_SEARCH_RADIUS,
  LATE_FRONTIER_MIN_HAUL,
  MAX_STORAGE_LEVEL,
  OVERFLOW_DEPOT_TRIGGER_CAPACITY,
  STORAGE_UPGRADE_COST,
  STORAGE_UPGRADE_TRIGGER_CAPACITY,
} from '../content'
import { findPath } from '../pathfinding'
import type { BuildingType, Position, SimulationState } from '../types'
import { getExpansionEligibility } from './expansionEligibility'
import {
  canPlanAdditionalDepot,
  FRONTIER_DEPOT_ID_PREFIX,
  getAvailableCapacity,
  getAvailableConstructionMaterial,
  hasReachableConstructionSite,
  isFrontierDepotSite,
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

function findFrontierDepotSite(
  state: SimulationState,
  lateOnly: boolean,
): Position | undefined {
  const { world } = state
  const stockpile = getPrimaryStockpile(world)
  if (!stockpile) return undefined

  const storage = lateOnly ? storageBuildings(world) : []
  const digs = state.dwarves.flatMap(({ position, task }) => {
    if (task.kind !== 'dig' || !task.target) return []
    const stand = task.path.at(-1) ?? position
    if (
      storage.some((building) => {
        const path = findPath(world, stand, building.position)
        return path !== null && path.length < LATE_FRONTIER_MIN_HAUL
      })
    )
      return []
    return [{ stand, target: task.target }]
  })
  const seen = new Set<string>()
  const sites: Array<{ position: Position; miners: number; travel: number }> =
    []
  const radius = FRONTIER_DEPOT_SEARCH_RADIUS

  for (const { target } of digs) {
    for (let y = target.y - radius; y <= target.y + radius; y += 1) {
      for (let x = target.x - radius; x <= target.x + radius; x += 1) {
        const key = `${x}:${y}`
        if (seen.has(key)) continue
        seen.add(key)
        const position = { x, y }
        if (
          !isFrontierDepotSite(position, stockpile.position) ||
          getBlock(world, x, y) !== 'air' ||
          !canPlaceBuilding(world, { type: 'depot', position }) ||
          !findPath(world, stockpile.position, position)
        ) {
          continue
        }

        let miners = 0
        let travel = 0
        for (const { stand } of digs) {
          const path = findPath(world, stand, position)
          if (!path || path.length > radius * 2) continue
          miners += 1
          travel += path.length
        }
        if (miners > 0) sites.push({ position, miners, travel })
      }
    }
  }

  sites.sort(
    (first, second) =>
      second.miners - first.miners || first.travel - second.travel,
  )
  return sites[0]?.position
}

export function inspectOverflowDepotSites(
  state: SimulationState,
): ConstructionSiteInspection & { frontier?: true } {
  if (state.constructionPolicy === 'expand') {
    const lateOnly = !canPlanAdditionalDepot(state.world)
    const site = findFrontierDepotSite(state, lateOnly)
    if (site) {
      return {
        reachableCandidate: site,
        placeableCandidate: site,
        frontier: true,
      }
    }
    if (lateOnly) return {}
  }
  return inspectConstructionSites(
    state,
    'depot',
    storageBuildings(state.world).flatMap(storagePerimeterCandidates),
  )
}

export function appendPlannedConstruction(
  state: SimulationState,
  type: 'depot' | 'outpost',
  position: Position,
  frontier = false,
): SimulationState {
  const definition = BUILDING_DEFINITIONS[type]
  const prefix = frontier ? FRONTIER_DEPOT_ID_PREFIX : `${type}-`
  const buildingId = `${prefix}${state.world.buildings.length + 1}`
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
  if (state.constructionPolicy === 'conserve') return state
  const eligibility = getExpansionEligibility(state)
  const lateOnly =
    state.constructionPolicy === 'expand' &&
    !canPlanAdditionalDepot(state.world)
  if (
    lateOnly
      ? state.tick % 20 !== 0
      : eligibility.availableCapacity > OVERFLOW_DEPOT_TRIGGER_CAPACITY
  ) {
    return state
  }
  if (
    !canPlanAdditionalDepot(state.world, state.constructionPolicy) ||
    eligibility.hasPendingDepot
  ) {
    return state
  }

  const definition = BUILDING_DEFINITIONS.depot
  if (eligibility.availableStone < definition.stone) return state

  const { reachableCandidate: site, frontier } =
    inspectOverflowDepotSites(state)
  if (!site) return state
  const planned = appendPlannedConstruction(state, 'depot', site, frontier)
  const order =
    planned.constructionOrders[planned.constructionOrders.length - 1]
  return reserveConstructionMaterials(planned, order.id)
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
  if (eligibility.availableCapacity > STORAGE_UPGRADE_TRIGGER_CAPACITY) {
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

export function planStorageConstruction(
  state: SimulationState,
): SimulationState {
  const planned = planStorageUpgradeOrder(planOverflowDepotOrder(state))
  if (
    state.safety.phase !== 'blocked' ||
    state.safety.blockedReason === 'storage-full'
  ) {
    return planExpansionOrder(planned)
  }
  return planned
}

export type ExpansionBuildingType = BuildingType

export { getAvailableCapacity, getAvailableConstructionMaterial }

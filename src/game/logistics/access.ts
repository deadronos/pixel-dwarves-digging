import { canPlaceBuilding, getPrimaryStockpile } from '../buildings'
import { BUILDING_DEFINITIONS } from '../content'
import { findAdjacentConstructionPaths, findPath } from '../pathfinding'
import type {
  AccessRequest,
  BuildingType,
  CommonBuildingMaterial,
  ConstructionOrder,
  MineableBlockType,
  Position,
  SimulationState,
  World,
} from '../types'
import { removeRecoveredConstructionOrder } from './constructionRecovery'
import {
  chooseCommonConstructionMaterial,
  getAvailableConstructionMaterial,
  hasActiveBuilder,
  hasReachableBuilder,
  hasReachableConstructionSite,
  type StorageDestination,
  selectStorageDestination,
} from './storage'

export type EmergencyLadderPlan = {
  position: Position
  world: World
  destination: StorageDestination
  path: Position[]
  material?: CommonBuildingMaterial
}

export function findEmergencyLadderPlan(
  state: SimulationState,
  from: Position,
  block: MineableBlockType,
  material?: CommonBuildingMaterial,
): EmergencyLadderPlan | null {
  const candidates = [
    from,
    { x: from.x, y: from.y + 1 },
    { x: from.x, y: from.y - 1 },
    { x: from.x - 1, y: from.y },
    { x: from.x + 1, y: from.y },
  ]

  for (const position of candidates) {
    if (!canPlaceBuilding(state.world, { type: 'ladder', position })) {
      continue
    }

    const buildingId = `emergency-ladder-${position.x}-${position.y}-${state.worldRevision}`
    const world: World = {
      ...state.world,
      buildings: [
        ...state.world.buildings,
        {
          id: buildingId,
          type: 'ladder',
          position,
          width: BUILDING_DEFINITIONS.ladder.width,
          height: BUILDING_DEFINITIONS.ladder.height,
          level: 1,
          construction: 'completed',
        },
      ],
    }
    const destination = selectStorageDestination(
      { ...state, world },
      block,
      from,
    )
    if (!destination) continue
    const path = findPath(world, from, destination.position)
    if (!path) continue
    return { position, world, destination, path, material }
  }

  return null
}

function accessSiteCandidates(request: AccessRequest): Array<{
  type: Exclude<BuildingType, 'stockpile' | 'outpost'>
  position: Position
}> {
  const { x, y } = request.target
  return [
    { type: 'ladder', position: { x, y: y - 1 } },
    { type: 'ladder', position: { x, y: y + 1 } },
    { type: 'ladder', position: { x: x - 1, y } },
    { type: 'ladder', position: { x: x + 1, y } },
    { type: 'bridge', position: { x: x - 1, y } },
    { type: 'bridge', position: { x: x + 1, y } },
  ]
}

export function planAccessConstructionOrder(
  state: SimulationState,
  request: AccessRequest,
): SimulationState {
  if (request.failure === 'storage-route') return state

  if (
    request.status !== 'open' ||
    state.constructionOrders.some(
      (order) => order.accessRequestId === request.id,
    )
  ) {
    return state
  }

  const stockpile = getPrimaryStockpile(state.world)
  if (!stockpile) return state

  for (const candidate of accessSiteCandidates(request)) {
    const definition = BUILDING_DEFINITIONS[candidate.type]
    if (!canPlaceBuilding(state.world, candidate)) continue
    if (
      !findAdjacentConstructionPaths(
        state.world,
        stockpile.position,
        candidate.position,
      )[0]
    ) {
      continue
    }
    const requiredAmount = definition.stone ?? 0
    const material =
      candidate.type === 'ladder'
        ? chooseCommonConstructionMaterial(state, requiredAmount)
        : getAvailableConstructionMaterial(state, 'stone') >= requiredAmount
          ? 'stone'
          : null
    if (!material) {
      return {
        ...state,
        accessRequests: state.accessRequests.map((current) =>
          current.id === request.id
            ? { ...current, blockedReason: 'waiting-for-stone' as const }
            : current,
        ),
      }
    }

    const buildingId = `${request.id}-${candidate.type}-${candidate.position.x}-${candidate.position.y}`
    const order: ConstructionOrder = {
      id: `${buildingId}-order`,
      buildingId,
      type: candidate.type,
      required: { [material]: requiredAmount },
      reserved: {},
      delivered: {},
      progress: 0,
      reason: 'access',
      accessRequestId: request.id,
    }
    return {
      ...state,
      world: {
        ...state.world,
        buildings: [
          ...state.world.buildings,
          {
            id: buildingId,
            type: candidate.type,
            position: candidate.position,
            width: definition.width,
            height: definition.height,
            level: 1,
            construction: 'planned',
          },
        ],
      },
      accessRequests: state.accessRequests.map((current) =>
        current.id === request.id
          ? { ...current, blockedReason: undefined }
          : current,
      ),
      constructionOrders: [...state.constructionOrders, order],
    }
  }

  return {
    ...state,
    accessRequests: state.accessRequests.map((current) =>
      current.id === request.id
        ? { ...current, blockedReason: 'no-builder-route' as const }
        : current,
    ),
  }
}

function recoverAccessOrders(
  state: SimulationState,
  recoverUnreachable: boolean,
): SimulationState {
  let next = state
  for (const order of state.constructionOrders) {
    if (order.reason !== 'access') continue

    const request = next.accessRequests.find(
      (candidate) => candidate.id === order.accessRequestId,
    )
    const building = next.world.buildings.find(
      (candidate) => candidate.id === order.buildingId,
    )
    const orphaned =
      order.accessRequestId === undefined || request === undefined
    const unreachable =
      recoverUnreachable &&
      building?.construction === 'planned' &&
      !hasActiveBuilder(next, building.id) &&
      !hasReachableBuilder(next, building.position)

    if (!orphaned && !unreachable) continue
    if (building && hasActiveBuilder(next, building.id)) continue
    if (
      building?.construction !== undefined &&
      building.construction !== 'planned'
    ) {
      continue
    }

    const recovered = removeRecoveredConstructionOrder(next, order)
    if (recovered) next = recovered
  }
  return next
}

export function recoverOrphanedAccessOrders(
  state: SimulationState,
): SimulationState {
  return recoverAccessOrders(state, false)
}

export function recoverStaleAccessOrders(
  state: SimulationState,
): SimulationState {
  return recoverAccessOrders(state, true)
}

export function recoverStaleOutpostOrders(
  state: SimulationState,
): SimulationState {
  let next = state
  for (const order of state.constructionOrders) {
    if (order.reason !== 'outpost') continue
    const building = next.world.buildings.find(
      (candidate) => candidate.id === order.buildingId,
    )
    if (
      building?.construction !== 'planned' ||
      hasActiveBuilder(next, building.id) ||
      hasReachableConstructionSite(next, building.position)
    ) {
      continue
    }

    const recovered = removeRecoveredConstructionOrder(next, order)
    if (recovered) next = recovered
  }
  return next
}

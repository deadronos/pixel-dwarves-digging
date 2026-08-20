import { canPlaceBuilding, getPrimaryStockpile } from './buildings'
import { BUILDING_DEFINITIONS } from './content'
import {
  findAdjacentPaths,
  findPath,
  isSupported,
  simulateDigWorld,
} from './pathfinding'
import {
  type AccessFailure,
  type AccessRequest,
  type BuildingType,
  type ConstructionOrder,
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

export type DigSafety = {
  safe: boolean
  failure?: AccessFailure
  storage?: StorageDestination
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
      !findAdjacentPaths(state.world, stockpile.position, candidate.position)[0]
    ) {
      continue
    }

    const buildingId = `${request.id}-${candidate.type}-${candidate.position.x}-${candidate.position.y}`
    const order: ConstructionOrder = {
      id: `${buildingId}-order`,
      buildingId,
      type: candidate.type,
      required: { stone: definition.stone },
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
      constructionOrders: [...state.constructionOrders, order],
    }
  }

  return state
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

export function assessDigSafety(
  state: SimulationState,
  stand: Position,
  target: Position,
): DigSafety {
  const targetCell = state.world.cells[target.y * state.world.width + target.x]
  if (
    !targetCell ||
    targetCell.block === 'air' ||
    targetCell.block === 'bedrock'
  ) {
    return { safe: false, failure: 'support' }
  }

  const worldAfterDig = simulateDigWorld(state.world, target)
  if (!isSupported(worldAfterDig, stand)) {
    return { safe: false, failure: 'support' }
  }

  const storage = selectStorageDestination(
    { ...state, world: worldAfterDig },
    targetCell.block,
    stand,
  )
  return storage
    ? { safe: true, storage }
    : { safe: false, failure: 'storage-route' }
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

export function planExpansionOrder(state: SimulationState): SimulationState {
  if (state.constructionPolicy !== 'expand') return state
  if (
    state.world.buildings.some((building) => building.type === 'outpost') ||
    state.constructionOrders.some((order) => order.type === 'outpost')
  ) {
    return state
  }

  const requiredStone = BUILDING_DEFINITIONS.outpost.stone
  if (state.inventory.stone < requiredStone) return state

  for (let x = state.world.start.x + 3; x < state.world.width - 1; x += 1) {
    const position = { x, y: state.world.start.y }
    if (!canPlaceBuilding(state.world, { type: 'outpost', position })) continue

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

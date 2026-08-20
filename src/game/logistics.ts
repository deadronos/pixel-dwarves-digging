import { canPlaceBuilding, getPrimaryStockpile } from './buildings'
import {
  BUILDING_DEFINITIONS,
  COMMON_BUILDING_MATERIALS,
  getEmergencyReserveMaterial,
  STARTER_PROTECTED_RADIUS,
} from './content'
import {
  findAdjacentPaths,
  findPath,
  isSupported,
} from './pathfinding'
import {
  type AccessFailure,
  type AccessRequest,
  type BuildingType,
  type CommonBuildingMaterial,
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

export type EmergencyLadderPlan = {
  position: Position
  world: World
  destination: StorageDestination
  path: Position[]
}

export function isBootstrapActive(state: SimulationState): boolean {
  return state.safety.phase === 'bootstrap'
}

export function isBootstrapProtectedTarget(
  state: SimulationState,
  target: Position,
): boolean {
  if (!isBootstrapActive(state)) return false

  const start = state.world.start
  const stockpile = getPrimaryStockpile(state.world)
  const underStarterPocket =
    target.y < start.y &&
    Math.abs(target.x - start.x) <= STARTER_PROTECTED_RADIUS
  const underStockpile =
    stockpile !== null &&
    target.y === stockpile.position.y - 1 &&
    target.x >= stockpile.position.x &&
    target.x < stockpile.position.x + stockpile.width

  return underStarterPocket || underStockpile
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

export function findEmergencyLadderPlan(
  state: SimulationState,
  from: Position,
  block: MineableBlockType,
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
    return { position, world, destination, path }
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
  // A missing storage route is a capacity/logistics failure, not a terrain
  // access failure. Building ladders here can create an infinite loop of
  // infrastructure that never makes the mined material deliverable.
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
      !findAdjacentPaths(state.world, stockpile.position, candidate.position)[0]
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

function getReservedStorageCapacity(
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

  if (!isSupported(state.world, stand, target)) {
    return { safe: false, failure: 'support' }
  }

  const storage = selectStorageDestination(
    state,
    targetCell.block,
    stand,
    undefined,
    target,
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
  if (getAvailableConstructionMaterial(state, 'stone') < requiredStone) {
    return state
  }

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

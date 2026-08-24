import {
  canPlaceBuilding,
  getPrimaryStockpile,
  returnMaterialToStorage,
} from './buildings'
import {
  BUILDING_DEFINITIONS,
  COMMON_BUILDING_MATERIALS,
  getEmergencyReserveMaterial,
  OVERFLOW_DEPOT_TRIGGER_CAPACITY,
  STARTER_PROTECTED_RADIUS,
} from './content'
import { findAdjacentPaths, findPath, isSupported } from './pathfinding'
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

const digSafetyCache = new WeakMap<World, Map<string, DigSafety>>()

function digSafetyKey(
  state: SimulationState,
  stand: Position,
  target: Position,
): string {
  const reservations = state.dwarves
    .filter(
      (dwarf) =>
        dwarf.carrying !== null &&
        dwarf.task.kind === 'haul' &&
        dwarf.task.target !== undefined,
    )
    .map((dwarf) => {
      const targetKey = dwarf.task.target
        ? `${dwarf.task.target.x}:${dwarf.task.target.y}`
        : ''
      return `${dwarf.id}:${dwarf.task.buildingId ?? ''}:${targetKey}`
    })
    .sort()
    .join('|')
  return `${stand.x}:${stand.y}|${target.x}:${target.y}|${state.policy.haulingPreference}|${reservations}`
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

function hasReachableConstructionSite(
  state: SimulationState,
  position: Position,
): boolean {
  const sources = [
    ...state.dwarves.map((dwarf) => dwarf.position),
    ...storageBuildings(state.world).map((building) => building.position),
  ]
  return sources.some(
    (source) => findAdjacentPaths(state.world, source, position).length > 0,
  )
}

function hasActiveBuilder(state: SimulationState, buildingId: string): boolean {
  return state.dwarves.some(
    (dwarf) =>
      dwarf.task.kind === 'build' && dwarf.task.buildingId === buildingId,
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

function assessDigSafetyUncached(
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

export function assessDigSafety(
  state: SimulationState,
  stand: Position,
  target: Position,
): DigSafety {
  let worldCache = digSafetyCache.get(state.world)
  if (!worldCache) {
    worldCache = new Map()
    digSafetyCache.set(state.world, worldCache)
  }

  const key = digSafetyKey(state, stand, target)
  const cached = worldCache.get(key)
  if (cached) return cached

  const result = assessDigSafetyUncached(state, stand, target)
  worldCache.set(key, result)
  return result
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
  if (state.constructionPolicy === 'conserve') return state
  if (
    state.world.buildings.some((building) => building.type === 'outpost') ||
    state.constructionOrders.some((order) => order.type === 'outpost')
  ) {
    return state
  }

  if (state.constructionOrders.some((order) => order.reason === 'capacity')) {
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
    state.world.buildings.some((building) => building.type === 'depot') ||
    state.constructionOrders.some((order) => order.type === 'depot')
  ) {
    return state
  }

  const definition = BUILDING_DEFINITIONS.depot
  if (getAvailableConstructionMaterial(state, 'stone') < definition.stone) {
    return state
  }

  const storage = storageBuildings(state.world)
  const candidates = storage.flatMap((building) => [
    { x: building.position.x + building.width, y: building.position.y },
    { x: building.position.x - 1, y: building.position.y },
    { x: building.position.x, y: building.position.y + building.height },
    { x: building.position.x, y: building.position.y - 1 },
  ])

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

function returnOrderMaterials(
  state: SimulationState,
  order: ConstructionOrder,
): SimulationState | null {
  let next = state
  for (const material of Object.keys(order.required) as Array<
    keyof Inventory
  >) {
    const amount =
      (order.reserved[material] ?? 0) + (order.delivered[material] ?? 0)
    for (let count = 0; count < amount; count += 1) {
      const returned = returnMaterialToStorage(next.world, material)
      if (!returned.stored) return null
      next = {
        ...next,
        world: returned.world,
        inventory: {
          ...next.inventory,
          [material]: next.inventory[material] + 1,
        },
      }
    }
  }
  return next
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

    const returned = returnOrderMaterials(next, order)
    if (!returned) continue
    next = {
      ...returned,
      world: {
        ...returned.world,
        buildings: returned.world.buildings.filter(
          (candidate) => candidate.id !== building.id,
        ),
      },
      constructionOrders: returned.constructionOrders.filter(
        (candidate) => candidate.id !== order.id,
      ),
    }
  }
  return next
}

import {
  BIOME_IDS,
  BUILDING_DEFINITIONS,
  MINEABLE_BLOCKS,
  STARTER_BOOTSTRAP_CLEAR_COUNT,
} from './content'
import {
  type AccessFailure,
  type AccessRequest,
  type BuildingConstruction,
  type BuildingState,
  type BuildingType,
  cloneInventory,
  MAP_HEIGHT,
  MAP_WIDTH,
  type MineableBlockType,
  type Position,
  type SerializedSave,
  type SimulationState,
} from './types'

export const SAVE_VERSION = 4

export type SaveParseResult = { state: SimulationState } | { error: string }

export function serializeState(state: SimulationState): string {
  const save: SerializedSave = {
    schemaVersion: SAVE_VERSION,
    state,
  }
  return JSON.stringify(save)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const BLOCK_TYPES = new Set(['air', 'bedrock', ...MINEABLE_BLOCKS])
const BUILDING_TYPES: readonly BuildingType[] = [
  'stockpile',
  'outpost',
  'bridge',
  'ladder',
]
const BUILDING_CONSTRUCTION: readonly BuildingConstruction[] = [
  'completed',
  'planned',
  'under-construction',
]
const ACCESS_FAILURES: readonly AccessFailure[] = [
  'support',
  'return-route',
  'storage-route',
]

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0
}

function isPosition(
  value: unknown,
  width: number,
  height: number,
): value is Position {
  return (
    isRecord(value) &&
    isInteger(value.x) &&
    isInteger(value.y) &&
    value.x >= 0 &&
    value.x < width &&
    value.y >= 0 &&
    value.y < height
  )
}

function isInventoryRecord(
  value: unknown,
  partial: boolean,
): value is Partial<SimulationState['inventory']> {
  if (!isRecord(value)) return false
  if (
    !Object.entries(value).every(
      ([material, amount]) =>
        MINEABLE_BLOCKS.includes(material as MineableBlockType) &&
        isNonNegativeInteger(amount),
    )
  ) {
    return false
  }
  return (
    partial ||
    MINEABLE_BLOCKS.every((material) => isNonNegativeInteger(value[material]))
  )
}

function isCell(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.block === 'string' &&
    BLOCK_TYPES.has(value.block) &&
    typeof value.biome === 'string' &&
    BIOME_IDS.includes(value.biome as (typeof BIOME_IDS)[number])
  )
}

function isStorage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.capacity) &&
    isInventoryRecord(value.inventory, true)
  )
}

function isBuilding(
  value: unknown,
  width: number,
  height: number,
): value is BuildingState {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !BUILDING_TYPES.includes(value.type as BuildingType) ||
    !isPosition(value.position, width, height) ||
    !isInteger(value.width) ||
    !isInteger(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.position.x + value.width > width ||
    value.position.y + value.height > height ||
    !isNonNegativeInteger(value.level) ||
    !BUILDING_CONSTRUCTION.includes(value.construction as BuildingConstruction)
  ) {
    return false
  }
  return value.storage === undefined || isStorage(value.storage)
}

function isTask(value: unknown, width: number, height: number): boolean {
  if (!isRecord(value) || !Array.isArray(value.path)) return false
  if (
    !['idle', 'dig', 'haul', 'build'].includes(value.kind as string) ||
    !isNonNegativeInteger(value.progress) ||
    !value.path.every((position) => isPosition(position, width, height))
  ) {
    return false
  }
  if (value.target !== undefined && !isPosition(value.target, width, height)) {
    return false
  }
  if (
    value.block !== undefined &&
    (typeof value.block !== 'string' ||
      !MINEABLE_BLOCKS.includes(value.block as MineableBlockType))
  ) {
    return false
  }
  if (value.buildingId !== undefined && typeof value.buildingId !== 'string') {
    return false
  }
  if (
    value.constructionOrderId !== undefined &&
    typeof value.constructionOrderId !== 'string'
  ) {
    return false
  }
  if (
    value.purpose !== undefined &&
    !['ordinary', 'access', 'recovery'].includes(value.purpose as string)
  ) {
    return false
  }
  if (
    value.accessRequestId !== undefined &&
    typeof value.accessRequestId !== 'string'
  ) {
    return false
  }
  return (
    value.recoveryReason === undefined ||
    ['stranded', 'storage-route'].includes(value.recoveryReason as string)
  )
}

function isDwarf(value: unknown, width: number, height: number): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isPosition(value.position, width, height) &&
    ['grounded', 'falling', 'stranded'].includes(value.movement as string) &&
    isTask(value.task, width, height) &&
    (value.carrying === null ||
      (typeof value.carrying === 'string' &&
        MINEABLE_BLOCKS.includes(value.carrying as MineableBlockType)))
  )
}

function isConstructionOrder(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.buildingId === 'string' &&
    ['outpost', 'bridge', 'ladder'].includes(value.type as string) &&
    isInventoryRecord(value.required, true) &&
    isInventoryRecord(value.reserved, true) &&
    isInventoryRecord(value.delivered, true) &&
    isNonNegativeInteger(value.progress) &&
    ['access', 'outpost', 'capacity', 'policy'].includes(
      value.reason as string,
    ) &&
    (value.accessRequestId === undefined ||
      typeof value.accessRequestId === 'string')
  )
}

function isAccessRequest(
  value: unknown,
  width: number,
  height: number,
): value is AccessRequest {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isPosition(value.target, width, height) &&
    ACCESS_FAILURES.includes(value.failure as AccessFailure) &&
    typeof value.priority === 'number' &&
    Number.isFinite(value.priority) &&
    (value.approach === undefined ||
      isPosition(value.approach, width, height)) &&
    isNonNegativeInteger(value.worldRevision) &&
    ['open', 'resolved', 'blocked'].includes(value.status as string) &&
    (value.blockedReason === undefined ||
      [
        'waiting-for-stone',
        'waiting-for-material',
        'no-builder-route',
      ].includes(value.blockedReason as string))
  )
}

function isWorld(value: unknown): value is SimulationState['world'] {
  if (!isRecord(value)) return false
  const width = value.width
  const height = value.height
  return (
    isInteger(width) &&
    width > 0 &&
    width <= MAP_WIDTH &&
    isInteger(height) &&
    height > 0 &&
    height <= MAP_HEIGHT &&
    typeof value.seed === 'string' &&
    isNonNegativeInteger(value.runNumber) &&
    Array.isArray(value.cells) &&
    value.cells.length === width * height &&
    value.cells.every(isCell) &&
    Array.isArray(value.surfaceHeights) &&
    value.surfaceHeights.length === width &&
    value.surfaceHeights.every(
      (surface) => isInteger(surface) && surface >= 0 && surface < height,
    ) &&
    Array.isArray(value.biomes) &&
    value.biomes.length === width &&
    value.biomes.every((biome) =>
      BIOME_IDS.includes(biome as (typeof BIOME_IDS)[number]),
    ) &&
    isPosition(value.start, width, height) &&
    isPosition(value.stockpile, width, height) &&
    Array.isArray(value.buildings) &&
    value.buildings.every((building) => isBuilding(building, width, height))
  )
}

function normalizeSafety(
  value: Record<string, unknown>,
): SimulationState['safety'] {
  const safety = value.safety
  if (
    isRecord(safety) &&
    (safety.phase === 'bootstrap' ||
      safety.phase === 'operational' ||
      safety.phase === 'blocked') &&
    typeof safety.emergencyStone === 'number'
  ) {
    const noProgressTicks =
      typeof safety.noProgressTicks === 'number' &&
      Number.isInteger(safety.noProgressTicks) &&
      safety.noProgressTicks >= 0
        ? safety.noProgressTicks
        : undefined
    return {
      phase: safety.phase,
      emergencyStone: Math.max(0, safety.emergencyStone),
      ...(noProgressTicks === undefined ? {} : { noProgressTicks }),
      ...(typeof safety.blockedReason === 'string'
        ? {
            blockedReason:
              safety.blockedReason as SimulationState['safety']['blockedReason'],
          }
        : {}),
    }
  }

  const inventory = value.inventory
  const stone =
    isRecord(inventory) && typeof inventory.stone === 'number'
      ? inventory.stone
      : 0
  const totalCleared =
    typeof value.totalCleared === 'number' ? value.totalCleared : 0
  return {
    phase:
      totalCleared >= STARTER_BOOTSTRAP_CLEAR_COUNT
        ? 'operational'
        : 'bootstrap',
    emergencyStone: Math.min(1, Math.max(0, stone)),
  }
}

function isSimulationState(value: unknown): value is SimulationState {
  if (!isRecord(value)) return false
  const world = value.world
  if (!isWorld(world)) return false
  const buildingIds = new Set(world.buildings.map((building) => building.id))
  const orderIds = new Set(
    Array.isArray(value.constructionOrders)
      ? value.constructionOrders
          .filter(isConstructionOrder)
          .map((order) => order.id)
      : [],
  )
  const requestIds = new Set(
    Array.isArray(value.accessRequests)
      ? value.accessRequests
          .filter((request) =>
            isAccessRequest(request, world.width, world.height),
          )
          .map((request) => request.id)
      : [],
  )
  const policy = value.policy
  const materialPriority =
    isRecord(policy) && isRecord(policy.materialPriority)
      ? policy.materialPriority
      : null
  const upgrades = value.upgrades
  const safety = value.safety
  return (
    new Set(world.buildings.map((building) => building.id)).size ===
      world.buildings.length &&
    Array.isArray(value.dwarves) &&
    new Set(
      value.dwarves
        .filter((dwarf) => isDwarf(dwarf, world.width, world.height))
        .map((dwarf) => (dwarf as { id: string }).id),
    ).size === value.dwarves.length &&
    value.dwarves.every((dwarf) => isDwarf(dwarf, world.width, world.height)) &&
    isInventoryRecord(value.inventory, false) &&
    isRecord(policy) &&
    ['nearest', 'ore-first', 'deepest-first'].includes(
      policy.workPreference as string,
    ) &&
    ['nearest-stockpile', 'finish-current-route'].includes(
      policy.haulingPreference as string,
    ) &&
    materialPriority !== null &&
    ['coal', 'iron', 'crystal', 'relic'].every(
      (material) => typeof materialPriority[material] === 'boolean',
    ) &&
    isRecord(upgrades) &&
    ['toolPower', 'moveSpeed', 'satchel', 'extraBunks', 'prospecting'].every(
      (upgrade) => isNonNegativeInteger(upgrades[upgrade]),
    ) &&
    isNonNegativeInteger(value.tick) &&
    isNonNegativeInteger(value.totalCleared) &&
    typeof value.prestigeCurrency === 'number' &&
    Number.isFinite(value.prestigeCurrency) &&
    value.prestigeCurrency >= 0 &&
    isNonNegativeInteger(value.discoveredRelics) &&
    typeof value.completed === 'boolean' &&
    Array.isArray(value.constructionOrders) &&
    value.constructionOrders.every(isConstructionOrder) &&
    new Set(value.constructionOrders.map((order) => order.id)).size ===
      value.constructionOrders.length &&
    value.constructionOrders.every(
      (order) =>
        buildingIds.has(order.buildingId) &&
        (order.accessRequestId === undefined ||
          requestIds.has(order.accessRequestId)),
    ) &&
    Array.isArray(value.accessRequests) &&
    value.accessRequests.every((request) =>
      isAccessRequest(request, world.width, world.height),
    ) &&
    new Set(value.accessRequests.map((request) => request.id)).size ===
      value.accessRequests.length &&
    isNonNegativeInteger(value.worldRevision) &&
    isRecord(safety) &&
    ['bootstrap', 'operational', 'blocked'].includes(safety.phase as string) &&
    isNonNegativeInteger(safety.emergencyStone) &&
    (safety.noProgressTicks === undefined ||
      isNonNegativeInteger(safety.noProgressTicks)) &&
    (safety.blockedReason === undefined ||
      [
        'waiting-for-stone',
        'waiting-for-material',
        'awaiting-recovery',
        'no-safe-work',
      ].includes(safety.blockedReason as string)) &&
    (value.constructionPolicy === 'conserve' ||
      value.constructionPolicy === 'balanced' ||
      value.constructionPolicy === 'expand') &&
    value.dwarves.every((dwarf) => {
      const task = dwarf as { task: Record<string, unknown> }
      return (
        (task.task.buildingId === undefined ||
          buildingIds.has(task.task.buildingId as string)) &&
        (task.task.constructionOrderId === undefined ||
          orderIds.has(task.task.constructionOrderId as string)) &&
        (task.task.accessRequestId === undefined ||
          requestIds.has(task.task.accessRequestId as string))
      )
    })
  )
}

function migrateV1State(value: unknown): SimulationState | null {
  if (!isRecord(value)) return null
  const world = value.world
  if (
    !isRecord(world) ||
    !isRecord(value.inventory) ||
    !isSimulationState({
      ...value,
      world: { ...world, buildings: [] },
      constructionOrders: [],
      constructionPolicy: 'balanced',
      accessRequests: [],
      worldRevision: 0,
      safety: { phase: 'bootstrap', emergencyStone: 0 },
    })
  ) {
    return null
  }

  const legacyStockpile = world.stockpile
  if (!isRecord(legacyStockpile)) return null
  const x = legacyStockpile.x
  const y = legacyStockpile.y
  if (typeof x !== 'number' || typeof y !== 'number') return null

  const stockpileDefinition = BUILDING_DEFINITIONS.stockpile
  const inventory = cloneInventory(
    value.inventory as SimulationState['inventory'],
  )
  const stockpile: BuildingState = {
    id: 'stockpile-1',
    type: 'stockpile',
    position: { x, y },
    width: stockpileDefinition.width,
    height: stockpileDefinition.height,
    level: 1,
    construction: 'completed',
    storage: {
      capacity: stockpileDefinition.capacity,
      inventory,
    },
  }

  return {
    ...(value as SimulationState),
    world: {
      ...(world as SimulationState['world']),
      buildings: [stockpile],
    },
    dwarves: (value.dwarves as SimulationState['dwarves']).map((dwarf) => ({
      ...dwarf,
      movement: 'grounded' as const,
    })),
    inventory,
    constructionOrders: [],
    constructionPolicy: 'balanced',
    accessRequests: [],
    worldRevision: 0,
    safety: { phase: 'bootstrap', emergencyStone: 0 },
  }
}

function normalizeV3State(
  value: unknown,
  addBedrockFloor: boolean,
): SimulationState | null {
  if (!isRecord(value)) return null
  const world = value.world
  if (
    !isRecord(world) ||
    typeof world.width !== 'number' ||
    !Array.isArray(world.cells)
  ) {
    return null
  }

  const width = world.width
  if (typeof width !== 'number') return null
  const cells = world.cells.map((cell, index) =>
    addBedrockFloor && Math.floor(index / width) === 0 && isRecord(cell)
      ? { ...cell, block: 'bedrock' as const }
      : cell,
  )
  const normalized = {
    ...value,
    world: { ...world, cells },
    accessRequests: Array.isArray(value.accessRequests)
      ? value.accessRequests
      : [],
    worldRevision:
      typeof value.worldRevision === 'number' ? value.worldRevision : 0,
    safety: normalizeSafety(value),
  }

  return isSimulationState(normalized) ? normalized : null
}

export function parseSave(payload: string): SaveParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return { error: 'Save file is not valid JSON.' }
  }

  if (!isRecord(parsed) || typeof parsed.schemaVersion !== 'number') {
    return { error: 'Save version is not supported.' }
  }

  if (parsed.schemaVersion === 1) {
    const migrated = migrateV1State(parsed.state)
    const normalized = normalizeV3State(migrated, true)
    return normalized
      ? { state: normalized }
      : { error: 'Save file is missing required simulation data.' }
  }

  if (
    parsed.schemaVersion !== 2 &&
    parsed.schemaVersion !== 3 &&
    parsed.schemaVersion !== SAVE_VERSION
  ) {
    return { error: 'Save version is not supported.' }
  }

  const normalized = normalizeV3State(parsed.state, parsed.schemaVersion === 2)
  if (!normalized) {
    return { error: 'Save file is missing required simulation data.' }
  }

  return { state: normalized }
}

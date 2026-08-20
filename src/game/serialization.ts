import { BUILDING_DEFINITIONS, STARTER_BOOTSTRAP_CLEAR_COUNT } from './content'
import {
  type BuildingState,
  cloneInventory,
  MAP_HEIGHT,
  MAP_WIDTH,
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
    return {
      phase: safety.phase,
      emergencyStone: Math.max(0, safety.emergencyStone),
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
  return (
    isRecord(world) &&
    typeof world.width === 'number' &&
    typeof world.height === 'number' &&
    world.width > 0 &&
    world.width <= MAP_WIDTH &&
    world.height > 0 &&
    world.height <= MAP_HEIGHT &&
    Array.isArray(world.cells) &&
    world.cells.length === world.width * world.height &&
    Array.isArray(world.buildings) &&
    Array.isArray(value.dwarves) &&
    isRecord(value.inventory) &&
    isRecord(value.policy) &&
    isRecord(value.upgrades) &&
    typeof value.tick === 'number' &&
    typeof value.totalCleared === 'number' &&
    typeof value.prestigeCurrency === 'number' &&
    typeof value.discoveredRelics === 'number' &&
    typeof value.completed === 'boolean' &&
    Array.isArray(value.constructionOrders) &&
    Array.isArray(value.accessRequests) &&
    typeof value.worldRevision === 'number' &&
    isRecord(value.safety) &&
    (value.safety.phase === 'bootstrap' ||
      value.safety.phase === 'operational' ||
      value.safety.phase === 'blocked') &&
    typeof value.safety.emergencyStone === 'number' &&
    (value.constructionPolicy === 'conserve' ||
      value.constructionPolicy === 'balanced' ||
      value.constructionPolicy === 'expand')
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

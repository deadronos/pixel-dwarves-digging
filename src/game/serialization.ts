import { BUILDING_DEFINITIONS } from './content'
import {
  type BuildingState,
  cloneInventory,
  MAP_HEIGHT,
  MAP_WIDTH,
  type SerializedSave,
  type SimulationState,
} from './types'

export const SAVE_VERSION = 2

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
  }
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
    return migrated
      ? { state: migrated }
      : { error: 'Save file is missing required simulation data.' }
  }

  if (parsed.schemaVersion !== SAVE_VERSION) {
    return { error: 'Save version is not supported.' }
  }

  if (!isSimulationState(parsed.state)) {
    return { error: 'Save file is missing required simulation data.' }
  }

  return { state: parsed.state }
}

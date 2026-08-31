import { BUILDING_DEFINITIONS, STARTER_BOOTSTRAP_CLEAR_COUNT } from '../content'
import { recoverOrphanedAccessOrders } from '../logistics/access'
import {
  type BuildingState,
  cloneInventory,
  type SimulationState,
} from '../types'
import { isRecord, isSimulationState } from './validation'

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

export function migrateV1State(value: unknown): SimulationState | null {
  if (!isRecord(value)) return null
  const { saveStatus: _straySaveStatus, ...cleanValue } = value
  const world = cleanValue.world
  if (
    !isRecord(world) ||
    !isRecord(cleanValue.inventory) ||
    !isSimulationState({
      ...cleanValue,
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
    cleanValue.inventory as SimulationState['inventory'],
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
    ...(cleanValue as SimulationState),
    world: {
      ...(world as SimulationState['world']),
      buildings: [stockpile],
    },
    dwarves: (cleanValue.dwarves as SimulationState['dwarves']).map(
      (dwarf) => ({
        ...dwarf,
        movement: 'grounded' as const,
      }),
    ),
    inventory,
    constructionOrders: [],
    constructionPolicy: 'balanced',
    accessRequests: [],
    worldRevision: 0,
    safety: { phase: 'bootstrap', emergencyStone: 0 },
  }
}

export function normalizeV3State(
  value: unknown,
  addBedrockFloor: boolean,
): { state: SimulationState; recoveredAccessOrders: number } | null {
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
  const { saveStatus: _straySaveStatus, ...cleanValue } = value
  const normalized = {
    ...cleanValue,
    world: { ...world, cells },
    accessRequests: Array.isArray(value.accessRequests)
      ? value.accessRequests
      : [],
    worldRevision:
      typeof value.worldRevision === 'number' ? value.worldRevision : 0,
    safety: normalizeSafety(value),
  }

  if (isSimulationState(normalized)) {
    return { state: normalized, recoveredAccessOrders: 0 }
  }
  if (!isSimulationState(normalized, true)) return null

  const orphanedAccessOrderCount = normalized.constructionOrders.filter(
    (order) => order.reason === 'access',
  ).length
  const repaired = recoverOrphanedAccessOrders(normalized)
  if (!isSimulationState(repaired)) return null

  return {
    state: repaired,
    recoveredAccessOrders:
      orphanedAccessOrderCount -
      repaired.constructionOrders.filter((order) => order.reason === 'access')
        .length,
  }
}

import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type SerializedSave,
  type SimulationState,
} from './types'

export const SAVE_VERSION = 1

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
    Array.isArray(value.dwarves) &&
    isRecord(value.inventory) &&
    isRecord(value.policy) &&
    isRecord(value.upgrades) &&
    typeof value.tick === 'number' &&
    typeof value.totalCleared === 'number' &&
    typeof value.prestigeCurrency === 'number' &&
    typeof value.discoveredRelics === 'number' &&
    typeof value.completed === 'boolean'
  )
}

export function parseSave(payload: string): SaveParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return { error: 'Save file is not valid JSON.' }
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== SAVE_VERSION) {
    return { error: 'Save version is not supported.' }
  }

  if (!isSimulationState(parsed.state)) {
    return { error: 'Save file is missing required simulation data.' }
  }

  return { state: parsed.state }
}

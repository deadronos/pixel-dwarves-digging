import { migrateV1State, normalizeV3State } from './serialization/migrations'
import { isRecord } from './serialization/validation'
import type { SerializedSave, SimulationState } from './types'

export const SAVE_VERSION = 4

export type SaveParseResult =
  | { state: SimulationState; recoveredAccessOrders?: number }
  | { error: string }

export function serializeState(state: SimulationState): string {
  const save: SerializedSave = {
    schemaVersion: SAVE_VERSION,
    state,
  }
  return JSON.stringify(save)
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
      ? {
          state: normalized.state,
          ...(normalized.recoveredAccessOrders > 0
            ? { recoveredAccessOrders: normalized.recoveredAccessOrders }
            : {}),
        }
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

  return {
    state: normalized.state,
    ...(normalized.recoveredAccessOrders > 0
      ? { recoveredAccessOrders: normalized.recoveredAccessOrders }
      : {}),
  }
}

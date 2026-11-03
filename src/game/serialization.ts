import { CellDataError, encodeCells } from './blocks'
import { migrateV1State, normalizeV3State } from './serialization/migrations'
import { isRecord } from './serialization/validation'
import type { SerializedSave, SimulationState } from './types'

/**
 * Schema history: 5 stores `world.cells` as base64 block ids (one byte per
 * cell) and drops per-cell biome; 4 and older store `{ block, biome }[]`.
 */
export const SAVE_VERSION = 5

export type SaveParseResult =
  | { state: SimulationState; recoveredAccessOrders?: number }
  | { error: string }

export function serializeState(state: SimulationState): string {
  const save: SerializedSave = {
    schemaVersion: SAVE_VERSION,
    state: {
      ...state,
      world: { ...state.world, cells: encodeCells(state.world.cells) },
    },
  }
  return JSON.stringify(save)
}

function tryNormalize(
  run: () => ReturnType<typeof normalizeV3State>,
): ReturnType<typeof normalizeV3State> | { error: string } {
  try {
    return run()
  } catch (error) {
    if (error instanceof CellDataError) return { error: error.message }
    throw error
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
    const normalized = tryNormalize(() =>
      normalizeV3State(migrateV1State(parsed.state), true),
    )
    if (normalized && 'error' in normalized) return normalized
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
    parsed.schemaVersion !== 4 &&
    parsed.schemaVersion !== SAVE_VERSION
  ) {
    return { error: 'Save version is not supported.' }
  }

  const normalized = tryNormalize(() =>
    normalizeV3State(parsed.state, parsed.schemaVersion === 2),
  )
  if (normalized && 'error' in normalized) return normalized
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

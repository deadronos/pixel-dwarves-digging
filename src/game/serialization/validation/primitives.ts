import { BIOME_IDS, MINEABLE_BLOCKS } from '../../content'
import type {
  AccessFailure,
  BuildingConstruction,
  BuildingType,
  MineableBlockType,
  Position,
  SimulationState,
} from '../../types'

export const BLOCK_TYPES = new Set(['air', 'bedrock', ...MINEABLE_BLOCKS])
export const BUILDING_TYPES: readonly BuildingType[] = [
  'stockpile',
  'outpost',
  'depot',
  'bridge',
  'ladder',
]
export const BUILDING_CONSTRUCTION: readonly BuildingConstruction[] = [
  'completed',
  'planned',
  'under-construction',
]
export const ACCESS_FAILURES: readonly AccessFailure[] = [
  'support',
  'return-route',
  'storage-route',
]

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0
}

export function isPosition(
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

export function isInventoryRecord(
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

export function isCell(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.block === 'string' &&
    BLOCK_TYPES.has(value.block) &&
    typeof value.biome === 'string' &&
    BIOME_IDS.includes(value.biome as (typeof BIOME_IDS)[number])
  )
}

export function isStorage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.capacity) &&
    isInventoryRecord(value.inventory, true)
  )
}

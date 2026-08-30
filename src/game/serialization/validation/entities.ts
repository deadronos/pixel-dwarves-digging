import { BIOME_IDS, MINEABLE_BLOCKS } from '../../content'
import type {
  AccessRequest,
  BuildingState,
  BuildingType,
  ConstructionOrder,
  DwarfState,
  MineableBlockType,
  SimulationState,
} from '../../types'
import { MAP_HEIGHT, MAP_WIDTH } from '../../types'
import {
  ACCESS_FAILURES,
  BUILDING_CONSTRUCTION,
  BUILDING_TYPES,
  isCell,
  isInteger,
  isInventoryRecord,
  isNonNegativeInteger,
  isPosition,
  isRecord,
  isStorage,
} from './primitives'

export function isBuilding(
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
    !BUILDING_CONSTRUCTION.includes(
      value.construction as BuildingState['construction'],
    )
  ) {
    return false
  }
  return value.storage === undefined || isStorage(value.storage)
}

export function isTask(value: unknown, width: number, height: number): boolean {
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
  if (
    value.recoveryReason !== undefined &&
    !['stranded', 'storage-route'].includes(value.recoveryReason as string)
  ) {
    return false
  }

  if (value.kind === 'dig') {
    return (
      value.target !== undefined &&
      value.buildingId === undefined &&
      value.constructionOrderId === undefined &&
      (value.purpose !== 'access' || typeof value.accessRequestId === 'string')
    )
  }

  if (value.kind === 'build') {
    return (
      value.target !== undefined &&
      typeof value.block === 'string' &&
      typeof value.buildingId === 'string' &&
      typeof value.constructionOrderId === 'string'
    )
  }

  if (value.kind === 'haul') {
    const hasCargo = typeof value.block === 'string'
    return (
      hasCargo &&
      (value.target !== undefined
        ? typeof value.buildingId === 'string'
        : value.purpose === 'recovery' &&
          value.recoveryReason === 'storage-route')
    )
  }

  return (
    value.target === undefined &&
    value.block === undefined &&
    value.buildingId === undefined &&
    value.constructionOrderId === undefined &&
    value.accessRequestId === undefined &&
    (value.purpose === undefined || value.purpose === 'recovery')
  )
}

export function isDwarf(
  value: unknown,
  width: number,
  height: number,
): value is DwarfState {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isPosition(value.position, width, height) &&
    ['grounded', 'falling', 'stranded'].includes(value.movement as string) &&
    isTask(value.task, width, height) &&
    (value.noProgressTicks === undefined ||
      isNonNegativeInteger(value.noProgressTicks)) &&
    (value.carrying === null ||
      (typeof value.carrying === 'string' &&
        MINEABLE_BLOCKS.includes(value.carrying as MineableBlockType)))
  )
}

export function isConstructionOrder(
  value: unknown,
): value is ConstructionOrder {
  const required = isRecord(value) ? value.required : undefined
  const reserved = isRecord(value) ? value.reserved : undefined
  const delivered = isRecord(value) ? value.delivered : undefined
  const materials = isRecord(required)
    ? Object.entries(required).filter(([, amount]) => (amount as number) > 0)
    : []
  const totalRequired = materials.reduce(
    (total, [, amount]) => total + (typeof amount === 'number' ? amount : 0),
    0,
  )
  const quantitiesValid = materials.every(([material, amount]) => {
    const key = material as MineableBlockType
    const requiredAmount = amount as number
    const reservedAmount = isRecord(reserved)
      ? ((reserved[key] as number | undefined) ?? 0)
      : 0
    const deliveredAmount = isRecord(delivered)
      ? ((delivered[key] as number | undefined) ?? 0)
      : 0
    return reservedAmount + deliveredAmount <= requiredAmount
  })
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.buildingId === 'string' &&
    BUILDING_TYPES.includes(value.type as BuildingType) &&
    isInventoryRecord(value.required, true) &&
    isInventoryRecord(value.reserved, true) &&
    isInventoryRecord(value.delivered, true) &&
    isNonNegativeInteger(value.progress) &&
    materials.length > 0 &&
    value.progress <= totalRequired &&
    quantitiesValid &&
    ['access', 'outpost', 'capacity', 'storage-upgrade', 'policy'].includes(
      value.reason as string,
    ) &&
    (value.targetLevel === undefined ||
      isNonNegativeInteger(value.targetLevel)) &&
    (value.reason === 'storage-upgrade'
      ? value.targetLevel !== undefined
      : value.targetLevel === undefined) &&
    (value.accessRequestId === undefined ||
      typeof value.accessRequestId === 'string')
  )
}

export function isAccessRequest(
  value: unknown,
  width: number,
  height: number,
): value is AccessRequest {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isPosition(value.target, width, height) &&
    ACCESS_FAILURES.includes(value.failure as AccessRequest['failure']) &&
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

export function isWorld(value: unknown): value is SimulationState['world'] {
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
    value.buildings.every((building) => isBuilding(building, width, height)) &&
    (value.topologyKey === undefined || isRecord(value.topologyKey))
  )
}

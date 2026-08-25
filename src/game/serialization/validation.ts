import {
  BIOME_IDS,
  BUILDING_DEFINITIONS,
  MINEABLE_BLOCKS,
} from '../content'
import type {
  AccessFailure,
  AccessRequest,
  BuildingConstruction,
  BuildingState,
  BuildingType,
  MineableBlockType,
  Position,
  SimulationState,
} from '../types'
import { MAP_HEIGHT, MAP_WIDTH } from '../types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const BLOCK_TYPES = new Set(['air', 'bedrock', ...MINEABLE_BLOCKS])
const BUILDING_TYPES: readonly BuildingType[] = [
  'stockpile',
  'outpost',
  'depot',
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

export function isNonNegativeInteger(value: unknown): value is number {
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

export function isDwarf(value: unknown, width: number, height: number): boolean {
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

export function isConstructionOrder(value: unknown): boolean {
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
    value.buildings.every((building) => isBuilding(building, width, height))
  )
}
export function isSimulationState(
  value: unknown,
  allowOrphanedAccessOrders = false,
): value is SimulationState {
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
    value.constructionOrders.every((order) => {
      const building = world.buildings.find(
        (candidate) => candidate.id === order.buildingId,
      )
      const orphanedAccessOrder =
        allowOrphanedAccessOrders &&
        order.reason === 'access' &&
        (building === undefined ||
          order.accessRequestId === undefined ||
          !requestIds.has(order.accessRequestId))
      return (
        (building !== undefined &&
          building.type === order.type &&
          (order.reason === 'storage-upgrade'
            ? building.construction === 'completed' &&
              building.storage !== undefined &&
              order.targetLevel === building.level + 1
            : building.construction !== 'completed') &&
          (order.accessRequestId === undefined ||
            requestIds.has(order.accessRequestId))) ||
        orphanedAccessOrder
      )
    }) &&
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
        'storage-full',
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
          requestIds.has(task.task.accessRequestId as string)) &&
        ((task.task.kind !== 'haul' && task.task.kind !== 'build') ||
          task.task.block === (dwarf as { carrying: string | null }).carrying)
      )
    })
  )
}

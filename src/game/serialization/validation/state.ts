import type { SimulationState } from '../../types'
import {
  isAccessRequest,
  isConstructionOrder,
  isDwarf,
  isWorld,
} from './entities'
import { hasUniqueIds } from './invariants'
import { isInventoryRecord, isNonNegativeInteger, isRecord } from './primitives'

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
    hasUniqueIds(world.buildings) &&
    Array.isArray(value.dwarves) &&
    hasUniqueIds(
      value.dwarves
        .filter((dwarf) => isDwarf(dwarf, world.width, world.height))
        .map((dwarf) => ({ id: (dwarf as { id: string }).id })),
    ) &&
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
    hasUniqueIds(value.constructionOrders) &&
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
    hasUniqueIds(value.accessRequests) &&
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

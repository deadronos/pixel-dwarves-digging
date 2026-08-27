import { returnMaterialToStorage } from '../buildings'
import { clearCell } from '../generation'
import { canMoveBetween, findAdjacentConstructionPaths } from '../pathfinding'
import type {
  ConstructionOrder,
  DwarfState,
  Inventory,
  Position,
  SimulationState,
  World,
} from '../types'
import { type AdvanceResult, recoveryTask } from './recovery'

export function chooseBuildOrder(
  state: SimulationState,
  dwarf: DwarfState,
  onlyOrderId?: string,
): {
  orderId: string
  path: Position[]
  stand: Position
  material: keyof Inventory
} | null {
  const activeClaims = (orderId: string, material: keyof Inventory) =>
    state.dwarves.filter(
      (candidate) =>
        candidate.task.kind === 'build' &&
        candidate.task.constructionOrderId === orderId &&
        candidate.carrying === material,
    ).length

  const candidates = state.constructionOrders
    .filter((order) => {
      if (onlyOrderId !== undefined && order.id !== onlyOrderId) return false
      const building = state.world.buildings.find(
        ({ id }) => id === order.buildingId,
      )
      if (
        !building ||
        (building.construction === 'completed' &&
          order.reason !== 'storage-upgrade')
      ) {
        return false
      }
      if (
        state.constructionPolicy === 'conserve' &&
        order.reason !== 'access'
      ) {
        return false
      }
      return Object.keys(order.required).some((material) => {
        const key = material as keyof Inventory
        const required = order.required[key] ?? 0
        const delivered = order.delivered[key] ?? 0
        const reserved = order.reserved[key] ?? 0
        return (
          delivered < required && reserved - activeClaims(order.id, key) > 0
        )
      })
    })
    .flatMap((order) => {
      const material = (
        Object.keys(order.required) as Array<keyof Inventory>
      ).find((key) => {
        const required = order.required[key] ?? 0
        const delivered = order.delivered[key] ?? 0
        const reserved = order.reserved[key] ?? 0
        return (
          delivered < required && reserved - activeClaims(order.id, key) > 0
        )
      })
      if (!material) return []
      const building = state.world.buildings.find(
        ({ id }) => id === order.buildingId,
      )
      if (!building) return []
      const route = findAdjacentConstructionPaths(
        state.world,
        dwarf.position,
        building.position,
      )[0]
      return route
        ? [{ orderId: order.id, reason: order.reason, material, ...route }]
        : []
    })
    .sort((first, second) => {
      const rank = (reason: ConstructionOrder['reason']) =>
        reason === 'access'
          ? 0
          : reason === 'capacity' || reason === 'storage-upgrade'
            ? 1
            : 2
      return (
        rank(first.reason) - rank(second.reason) ||
        first.path.length - second.path.length
      )
    })

  return candidates[0] ?? null
}

export { clearCell }

export function unchanged(dwarf: DwarfState, world: World): AdvanceResult {
  return { dwarf, world, minedBlock: null }
}

export function samePosition(first: Position, second: Position): boolean {
  return first.x === second.x && first.y === second.y
}

export function validPath(
  world: World,
  from: Position,
  path: Position[],
  steps: number,
): boolean {
  let current = from
  for (const next of path.slice(0, steps)) {
    if (!canMoveBetween(world, current, next)) return false
    current = next
  }
  return true
}

export function invalidateTask(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const buildMaterial =
    dwarf.task.kind === 'build' && dwarf.task.constructionOrderId
      ? dwarf.carrying
      : null
  const returnedMaterial = buildMaterial
    ? returnMaterialToStorage(state.world, buildMaterial)
    : { world: state.world, stored: false }
  const inventory =
    buildMaterial && returnedMaterial.stored
      ? {
          ...state.inventory,
          [buildMaterial]: state.inventory[buildMaterial] + 1,
        }
      : undefined
  const constructionOrders =
    buildMaterial && dwarf.task.constructionOrderId
      ? state.constructionOrders.map((order) =>
          order.id === dwarf.task.constructionOrderId
            ? {
                ...order,
                reserved: {
                  ...order.reserved,
                  [buildMaterial]: Math.max(
                    0,
                    (order.reserved[buildMaterial] ?? 0) - 1,
                  ),
                },
              }
            : order,
        )
      : undefined
  return {
    dwarf: {
      ...dwarf,
      carrying:
        buildMaterial && returnedMaterial.stored ? null : dwarf.carrying,
      task:
        buildMaterial && returnedMaterial.stored
          ? { kind: 'idle', path: [], progress: 0 }
          : recoveryTask(dwarf, dwarf.carrying ? 'storage-route' : 'stranded'),
    },
    world: returnedMaterial.world,
    minedBlock: null,
    inventory,
    constructionOrders,
  }
}

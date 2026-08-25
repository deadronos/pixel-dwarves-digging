import { consumeConstructionMaterial } from '../buildings'
import { getEmergencyReserveMaterial, MINERAL_BLOCKS } from '../content'
import { getCell } from '../generation'
import {
  chooseCommonConstructionMaterial,
  findEmergencyLadderPlan,
} from '../logistics'
import { isSupported } from '../pathfinding'
import type {
  DwarfState,
  MineableBlockType,
  SimulationState,
  World,
} from '../types'

export type AdvanceResult = {
  dwarf: DwarfState
  world: World
  minedBlock: MineableBlockType | null
  depositedBlock?: MineableBlockType | null
  inventory?: SimulationState['inventory']
  constructionOrders?: SimulationState['constructionOrders']
  safety?: SimulationState['safety']
  progressed?: boolean
}

export function recoveryTask(
  dwarf: DwarfState,
  reason: 'stranded' | 'storage-route',
) {
  const currentBuildingId =
    dwarf.task.kind === 'haul' ? dwarf.task.buildingId : undefined
  return dwarf.carrying
    ? {
        kind: 'haul' as const,
        path: [],
        progress: 0,
        block: dwarf.carrying,
        ...(currentBuildingId ? { buildingId: currentBuildingId } : {}),
        purpose: 'recovery' as const,
        recoveryReason: 'storage-route' as const,
      }
    : {
        kind: 'idle' as const,
        path: [],
        progress: 0,
        purpose: 'recovery' as const,
        recoveryReason: reason,
      }
}

export function attemptEmergencyRecovery(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult | null {
  const usesCarriedMaterial =
    dwarf.carrying !== null && !MINERAL_BLOCKS.has(dwarf.carrying)
  const reserveMaterial = getEmergencyReserveMaterial(state.inventory)
  const stockMaterial = !usesCarriedMaterial
    ? chooseCommonConstructionMaterial(state, 1)
    : null
  const usesReserve =
    !usesCarriedMaterial &&
    !stockMaterial &&
    state.safety.emergencyStone > 0 &&
    reserveMaterial !== null
  const usesStockMaterial = !usesCarriedMaterial && stockMaterial !== null
  if (!usesCarriedMaterial && !usesReserve && !usesStockMaterial) return null

  const plan = findEmergencyLadderPlan(
    state,
    dwarf.position,
    dwarf.carrying ?? reserveMaterial ?? 'stone',
    stockMaterial ?? undefined,
  )
  if (!plan) return null

  const strandedRecovery =
    dwarf.movement === 'stranded' || dwarf.task.recoveryReason === 'stranded'
  let recoveryWorld = plan.world
  let inventory = state.inventory
  if (usesReserve && reserveMaterial) {
    inventory = {
      ...inventory,
      [reserveMaterial]: Math.max(0, inventory[reserveMaterial] - 1),
    }
  } else if (usesStockMaterial && stockMaterial) {
    const consumed = consumeConstructionMaterial(
      { ...state, world: recoveryWorld },
      stockMaterial,
      1,
    )
    if (!consumed) return null
    recoveryWorld = consumed.world
    inventory = consumed.inventory
  }
  const retainedCarriedMaterial = usesCarriedMaterial ? null : dwarf.carrying
  const task = {
    kind: 'haul' as const,
    target: plan.destination.position,
    path: plan.path,
    progress: 0,
    ...(retainedCarriedMaterial ? { block: retainedCarriedMaterial } : {}),
    buildingId: plan.destination.id,
    purpose: 'recovery' as const,
    recoveryReason: strandedRecovery
      ? ('stranded' as const)
      : ('storage-route' as const),
  }

  return {
    dwarf: {
      ...dwarf,
      movement: 'grounded',
      carrying: retainedCarriedMaterial,
      task,
    },
    world: recoveryWorld,
    minedBlock: null,
    inventory: usesReserve || usesStockMaterial ? inventory : undefined,
    safety: usesReserve
      ? { ...state.safety, emergencyStone: state.safety.emergencyStone - 1 }
      : state.safety,
    progressed: true,
  }
}

export function settleDwarf(world: World, dwarf: DwarfState): DwarfState {
  if (isSupported(world, dwarf.position)) {
    return { ...dwarf, movement: 'grounded' }
  }

  for (let y = dwarf.position.y - 1; y >= 0; y -= 1) {
    const candidate = { x: dwarf.position.x, y }
    if (getCell(world, candidate.x, candidate.y).block !== 'air') continue
    if (!isSupported(world, candidate)) continue
    return {
      ...dwarf,
      position: candidate,
      movement: 'falling',
      task: recoveryTask(dwarf, 'stranded'),
    }
  }

  return {
    ...dwarf,
    movement: 'stranded',
    task: recoveryTask(dwarf, 'stranded'),
  }
}

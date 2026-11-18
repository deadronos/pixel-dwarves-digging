import { consumeConstructionMaterial, getPrimaryStockpile } from '../buildings'
import { storedCount } from '../buildings/storage'
import { FRONTIER_DEPOT_MIN_DISTANCE, MINEABLE_BLOCKS } from '../content'
import { findPath } from '../pathfinding'
import type { BuildingState, SimulationState, StorageState } from '../types'
import {
  getAvailableConstructionMaterial,
  getAvailableStateCapacity,
  storageBuildings,
} from './storage'
import { getWorkshopFreightHold } from './workshop'

export const FREIGHT_SETUP_STONE = 12
export const FREIGHT_INTERVAL_TICKS = 20
export const FREIGHT_BATCH_SIZE = 12

type FreightStatus =
  | 'off'
  | 'waiting-for-depot'
  | 'waiting-for-stone'
  | 'setup'
  | 'disconnected'
  | 'backpressure'
  | 'starved'
  | 'workshop-supply'
  | 'ready'

function selectDepot(
  state: SimulationState,
  stockpile: BuildingState,
): BuildingState | undefined {
  let selected: BuildingState | undefined
  let longest = FRONTIER_DEPOT_MIN_DISTANCE - 1
  for (const depot of storageBuildings(state.world)) {
    if (depot.type !== 'depot') continue
    const path = findPath(state.world, depot.position, stockpile.position)
    if (path && path.length > longest) {
      longest = path.length
      selected = depot
    }
  }
  return selected
}

function inspectFreight(state: SimulationState): {
  status: FreightStatus
  depot?: BuildingState
  stockpile?: BuildingState
  availableSlots: number
  hold?: ReturnType<typeof getWorkshopFreightHold>
} {
  const freight = state.freight
  if (!freight?.enabled) return { status: 'off', availableSlots: 0 }

  const stockpile = getPrimaryStockpile(state.world)
  if (!stockpile?.storage) return { status: 'disconnected', availableSlots: 0 }

  const availableSlots = getAvailableStateCapacity(state, stockpile.id)
  if (!freight.depotId) {
    const depot = selectDepot(state, stockpile)
    if (!depot) return { status: 'waiting-for-depot', availableSlots }
    return {
      status:
        getAvailableConstructionMaterial(state, 'stone') >= FREIGHT_SETUP_STONE
          ? 'setup'
          : 'waiting-for-stone',
      depot,
      availableSlots,
    }
  }

  const depot = storageBuildings(state.world).find(
    (building) => building.id === freight.depotId && building.type === 'depot',
  )
  if (
    !depot?.storage ||
    !findPath(state.world, depot.position, stockpile.position)
  ) {
    return { status: 'disconnected', depot, availableSlots }
  }

  const hold = getWorkshopFreightHold(state, depot)
  const stored = storedCount(depot.storage.inventory)
  let status: FreightStatus = 'ready'
  if (stored === 0) status = 'starved'
  else if (stored === hold?.amount) status = 'workshop-supply'
  else if (availableSlots === 0) status = 'backpressure'
  return { status, depot, stockpile, availableSlots, hold }
}

export function getFreightStatus(state: SimulationState) {
  const { status, depot, availableSlots } = inspectFreight(state)
  return {
    status,
    depotId: state.freight?.depotId ?? depot?.id,
    depotPosition: state.freight?.depotId ? depot?.position : undefined,
    moved: state.freight?.moved ?? 0,
    availableSlots,
    ticksUntilTransfer:
      FREIGHT_INTERVAL_TICKS - (state.tick % FREIGHT_INTERVAL_TICKS),
  }
}

function transferBatch(
  source: StorageState,
  destination: StorageState,
  capacity: number,
  hold: ReturnType<typeof getWorkshopFreightHold>,
) {
  // The destination slots are claimed against existing dwarf reservations
  // and committed with the source debit in the same tick.
  let remaining = Math.min(capacity, FREIGHT_BATCH_SIZE)
  const sourceInventory = { ...source.inventory }
  const destinationInventory = { ...destination.inventory }

  for (const material of MINEABLE_BLOCKS) {
    const stored = sourceInventory[material] ?? 0
    const amount = Math.min(
      remaining,
      stored - (material === hold?.material ? hold.amount : 0),
    )
    if (amount === 0) continue
    sourceInventory[material] = (sourceInventory[material] ?? 0) - amount
    destinationInventory[material] =
      (destinationInventory[material] ?? 0) + amount
    remaining -= amount
    if (remaining === 0) break
  }

  return {
    source: { ...source, inventory: sourceInventory },
    destination: { ...destination, inventory: destinationInventory },
    moved: Math.min(capacity, FREIGHT_BATCH_SIZE) - remaining,
  }
}

export function advanceFreight(state: SimulationState): SimulationState {
  const freight = state.freight
  if (!freight?.enabled || state.completed) return state
  if (freight.depotId && (state.tick + 1) % FREIGHT_INTERVAL_TICKS !== 0)
    return state

  const { status, depot, stockpile, availableSlots, hold } =
    inspectFreight(state)
  if (status === 'setup' && depot) {
    const paid = consumeConstructionMaterial(
      state,
      'stone',
      FREIGHT_SETUP_STONE,
    )
    return paid
      ? { ...paid, freight: { ...freight, depotId: depot.id } }
      : state
  }
  if (status !== 'ready' || !depot?.storage || !stockpile?.storage) return state

  const batch = transferBatch(
    depot.storage,
    stockpile.storage,
    availableSlots,
    hold,
  )
  return {
    ...state,
    freight: { ...freight, moved: freight.moved + batch.moved },
    world: {
      ...state.world,
      buildings: state.world.buildings.map((building) => {
        if (building === depot) return { ...depot, storage: batch.source }
        if (building === stockpile)
          return { ...stockpile, storage: batch.destination }
        return building
      }),
    },
  }
}

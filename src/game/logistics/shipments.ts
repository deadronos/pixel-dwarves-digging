import { getPrimaryStockpile } from '../buildings'
import { MINEABLE_BLOCKS, MINERAL_BLOCKS } from '../content'
import type {
  Inventory,
  MineableBlockType,
  ShipmentMode,
  SimulationState,
} from '../types'
import { getAvailableConstructionMaterial } from './storage'

export const SHIPMENT_INTERVAL_TICKS = 100
export const SHIPMENT_BATCH_SIZE = 24
export const SHIPMENT_RESERVES = { stone: 24, common: 4, ore: 8 }

function materialReserve(material: MineableBlockType): number {
  if (material === 'stone') return SHIPMENT_RESERVES.stone
  return MINERAL_BLOCKS.has(material)
    ? SHIPMENT_RESERVES.ore
    : SHIPMENT_RESERVES.common
}

function planShipment(state: SimulationState, mode: ShipmentMode) {
  const stockpile = getPrimaryStockpile(state.world)
  const stored = stockpile?.storage?.inventory
  const items: Array<{ material: MineableBlockType; amount: number }> = []
  if (!stored || mode === 'off') return { stockpile, items }

  let remaining = SHIPMENT_BATCH_SIZE
  for (const material of MINEABLE_BLOCKS) {
    if (
      material === 'relic' ||
      (mode === 'spoil' && MINERAL_BLOCKS.has(material))
    )
      continue
    const surplus =
      getAvailableConstructionMaterial(state, material) -
      materialReserve(material)
    const amount = Math.min(stored[material] ?? 0, surplus, remaining)
    if (amount <= 0) continue
    items.push({ material, amount })
    remaining -= amount
    if (remaining === 0) break
  }
  return { stockpile, items }
}

export function getShipmentStatus(state: SimulationState) {
  const { mode, shipped } = state.shipments ?? { mode: 'off', shipped: 0 }
  const { stockpile, items } = planShipment(state, mode)
  return {
    mode,
    shipped,
    completed: state.completed,
    ticksUntilDispatch:
      SHIPMENT_INTERVAL_TICKS - (state.tick % SHIPMENT_INTERVAL_TICKS),
    ready: items.reduce((sum, { amount }) => sum + amount, 0),
    hasStockpile: stockpile?.storage !== undefined,
  }
}

export function dispatchSurplus(state: SimulationState): SimulationState {
  const shipments = state.shipments
  if (
    !shipments ||
    shipments.mode === 'off' ||
    (state.tick + 1) % SHIPMENT_INTERVAL_TICKS !== 0
  )
    return state
  const { stockpile, items } = planShipment(state, shipments.mode)
  if (!stockpile?.storage || items.length === 0) return state

  const inventory: Inventory = { ...state.inventory }
  const storage = {
    ...stockpile.storage,
    inventory: { ...stockpile.storage.inventory },
  }
  let shipped = shipments.shipped
  for (const { material, amount } of items) {
    inventory[material] -= amount
    storage.inventory[material] = (storage.inventory[material] ?? 0) - amount
    shipped += amount
  }
  return {
    ...state,
    shipments: { ...shipments, shipped },
    inventory,
    world: {
      ...state.world,
      buildings: state.world.buildings.map((building) =>
        building === stockpile ? { ...stockpile, storage } : building,
      ),
    },
  }
}

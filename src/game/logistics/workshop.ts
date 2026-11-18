import { COMMON_BUILDING_MATERIALS } from '../content'
import type {
  BuildingState,
  CommonBuildingMaterial,
  SimulationState,
  StorageState,
} from '../types'
import { SHIPMENT_RESERVES } from './shipments'
import { getAvailableConstructionMaterial } from './storage'

export const WORKSHOP_INTERVAL_TICKS = 50
export const WORKSHOP_INPUT_AMOUNT = 3

type WorkshopInput = CommonBuildingMaterial
type WorkshopSite = BuildingState & {
  type: 'depot' | 'outpost'
  storage: StorageState
}

type WorkshopStatus = {
  enabled: boolean
  produced: number
  site: Pick<WorkshopSite, 'id' | 'type' | 'position'> | null
  input: WorkshopInput | null
  reason: 'off' | 'completed' | 'no-site' | 'waiting-for-spoil' | 'ready'
  ticksUntilProduction: number
}

const WORKSHOP_INPUTS: WorkshopInput[] = [
  ...COMMON_BUILDING_MATERIALS.filter((material) => material !== 'stone'),
  'stone',
]

function isWorkshopSite(building: BuildingState): building is WorkshopSite {
  return (
    (building.type === 'depot' || building.type === 'outpost') &&
    building.construction === 'completed' &&
    building.storage !== undefined
  )
}

function surplusWorkshopInputs(state: SimulationState) {
  return WORKSHOP_INPUTS.filter(
    (material) =>
      getAvailableConstructionMaterial(state, material) >=
      (material === 'stone'
        ? SHIPMENT_RESERVES.stone
        : SHIPMENT_RESERVES.common) +
        WORKSHOP_INPUT_AMOUNT,
  )
}

export function getWorkshopFreightHold(
  state: SimulationState,
  depot: BuildingState,
) {
  if (!state.workshop?.enabled || !isWorkshopSite(depot)) return undefined
  const local = depot.storage.inventory
  const inputs = surplusWorkshopInputs(state)
  const material =
    inputs.find((input) => (local[input] ?? 0) >= WORKSHOP_INPUT_AMOUNT) ??
    inputs.find((input) => (local[input] ?? 0) > 0)
  return material
    ? {
        material,
        amount: Math.min(local[material] ?? 0, WORKSHOP_INPUT_AMOUNT),
      }
    : undefined
}

function planWorkshop(state: SimulationState, produced: number) {
  const sites = state.world.buildings.filter(isWorkshopSite)
  if (sites.length === 0) return { site: null, input: null }

  const surplusInputs = surplusWorkshopInputs(state)
  const firstIndex = produced % sites.length
  for (let offset = 0; offset < sites.length; offset += 1) {
    const site = sites[(firstIndex + offset) % sites.length]
    const input = surplusInputs.find(
      (material) =>
        (site.storage.inventory[material] ?? 0) >= WORKSHOP_INPUT_AMOUNT,
    )
    if (input) return { site, input }
  }
  return { site: sites[firstIndex], input: null }
}

export function getWorkshopStatus(state: SimulationState): WorkshopStatus {
  const { enabled, produced } = state.workshop ?? {
    enabled: false,
    produced: 0,
  }
  const status = {
    enabled,
    produced,
    site: null,
    input: null,
    ticksUntilProduction:
      WORKSHOP_INTERVAL_TICKS - (state.tick % WORKSHOP_INTERVAL_TICKS),
  }
  if (!enabled) return { ...status, reason: 'off' }
  if (state.completed) return { ...status, reason: 'completed' }

  const { site, input } = planWorkshop(state, produced)
  if (!site) return { ...status, reason: 'no-site' }
  const { id, type, position } = site
  return {
    ...status,
    site: { id, type, position },
    input,
    reason: input ? 'ready' : 'waiting-for-spoil',
  }
}

export function advanceWorkshop(state: SimulationState): SimulationState {
  const workshop = state.workshop
  if (
    !workshop?.enabled ||
    state.completed ||
    (state.tick + 1) % WORKSHOP_INTERVAL_TICKS !== 0
  )
    return state

  const { site, input } = planWorkshop(state, workshop.produced)
  if (!site || !input) return state

  const localInventory = { ...site.storage.inventory }
  localInventory[input] = (localInventory[input] ?? 0) - WORKSHOP_INPUT_AMOUNT
  localInventory.stone = (localInventory.stone ?? 0) + 1
  const storage = {
    ...site.storage,
    inventory: localInventory,
  }
  const inventory = { ...state.inventory }
  inventory[input] -= WORKSHOP_INPUT_AMOUNT
  inventory.stone += 1
  return {
    ...state,
    workshop: { ...workshop, produced: workshop.produced + 1 },
    inventory,
    world: {
      ...state.world,
      buildings: state.world.buildings.map((building) =>
        building === site ? { ...site, storage } : building,
      ),
    },
  }
}

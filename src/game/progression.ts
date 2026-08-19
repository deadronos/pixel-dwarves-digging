import { generateWorld } from './generation'
import {
  cloneInventory,
  type DwarfState,
  EMPTY_INVENTORY,
  type PrestigeMode,
  type SimulationState,
  type UpgradeLevels,
} from './types'

export const DEFAULT_UPGRADES: UpgradeLevels = {
  toolPower: 0,
  moveSpeed: 0,
  satchel: 0,
  extraBunks: 0,
  prospecting: 0,
}

export const UPGRADE_COSTS = {
  toolPower: 20,
  moveSpeed: 25,
  satchel: 30,
  extraBunks: 40,
  prospecting: 35,
} as const

function createDwarves(
  state: SimulationState,
  world: SimulationState['world'],
): DwarfState[] {
  const count = 3 + state.upgrades.extraBunks
  return Array.from({ length: count }, (_, index) => ({
    id: `dwarf-${index + 1}`,
    position: { ...world.start },
    movement: 'grounded' as const,
    task: { kind: 'idle' as const, path: [], progress: 0 },
    carrying: null,
  }))
}

export function canPrestige(
  state: SimulationState,
  mode: PrestigeMode,
): boolean {
  return mode === 'full-clear' ? state.completed : state.discoveredRelics > 0
}

export function prestigeReward(
  state: SimulationState,
  mode: PrestigeMode,
): number {
  if (mode === 'full-clear') return 25 + Math.floor(state.totalCleared / 100)
  return 10 + state.discoveredRelics * 5
}

export function startPrestige(
  state: SimulationState,
  mode: PrestigeMode,
): SimulationState {
  const world = generateWorld(state.world.seed, state.world.runNumber + 1)
  return {
    ...state,
    world,
    dwarves: createDwarves(state, world),
    inventory: { ...EMPTY_INVENTORY },
    tick: 0,
    totalCleared: 0,
    completed: false,
    discoveredRelics: 0,
    prestigeCurrency: state.prestigeCurrency + prestigeReward(state, mode),
    upgrades: { ...state.upgrades },
  }
}

export function purchaseUpgrade(
  state: SimulationState,
  upgrade: keyof UpgradeLevels,
): SimulationState {
  const cost = UPGRADE_COSTS[upgrade]
  if (state.prestigeCurrency < cost) return state

  return {
    ...state,
    prestigeCurrency: state.prestigeCurrency - cost,
    upgrades: { ...state.upgrades, [upgrade]: state.upgrades[upgrade] + 1 },
  }
}

export function cloneProgressionState(state: SimulationState): SimulationState {
  return {
    ...state,
    inventory: cloneInventory(state.inventory),
    upgrades: { ...state.upgrades },
  }
}

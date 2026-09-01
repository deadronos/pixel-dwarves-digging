import { getPrimaryStockpile } from './buildings'
import { BIOME_DEFINITIONS, type BiomeDefinition } from './content'
import { countSolids } from './generation'
import {
  getAggregateInventory,
  getStorageDiagnostics,
  type StorageDiagnostics,
} from './logistics'
import { canPrestige } from './progression'
import type { GameStore } from './state'
import type {
  AccessRequest,
  BuildingState,
  ConstructionPolicy,
  DwarfState,
  Inventory,
  PolicyState,
  SafetyPhase,
  SafetyState,
  SimulationState,
  UpgradeLevels,
  World,
} from './types'

export type ExcavationSummary = {
  remaining: number
  totalCleared: number
  total: number
  progress: number
}

export type DwarfCounts = {
  total: number
  onTask: number
  inRecovery: number
}

export type BuildingCounts = {
  outposts: number
  depots: number
}

export type StockpileSummary = {
  stored: number
  capacity: number
}

export type PrestigeSummary = {
  currency: number
  canFullClear: boolean
  canRelicReset: boolean
}

export type HudViewModel = {
  runNumber: number
  seed: string
  tick: number
  statusChip: string
  inventory: Inventory
  aggregateStored: number
  remainingSolids: number
  openAccessRequests: number
  safetySummary: string
}

export type InspectorViewModel = {
  progress: number
  totalCleared: number
  remainingSolids: number
  dwarfCounts: DwarfCounts
  biomeLabel: string
  discoveredRelics: number
  mainStockpile: StockpileSummary
  storageDiagnostics: StorageDiagnostics
  buildingCounts: BuildingCounts
  constructionCount: number
  openAccessRequests: number
  safetySummary: string
  directiveSummary: string
  prestige: PrestigeSummary
  upgrades: UpgradeLevels
}

export function getRemainingSolids(world: Pick<World, 'cells'>): number {
  return countSolids({ cells: world.cells })
}

export function getExcavationProgress(
  remaining: number,
  totalCleared: number,
): number {
  const total = remaining + totalCleared
  return total === 0 ? 100 : Math.round((totalCleared / total) * 100)
}

export function getExcavationSummary(
  world: Pick<World, 'cells'>,
  totalCleared: number,
): ExcavationSummary {
  const remaining = getRemainingSolids(world)
  const total = remaining + totalCleared
  const progress = total === 0 ? 100 : Math.round((totalCleared / total) * 100)
  return { remaining, totalCleared, total, progress }
}

export function getDwarfCounts(dwarves: readonly DwarfState[]): DwarfCounts {
  let onTask = 0
  let inRecovery = 0
  for (const dwarf of dwarves) {
    if (dwarf.task.kind !== 'idle') {
      onTask += 1
    }
    if (dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded') {
      inRecovery += 1
    }
  }
  return {
    total: dwarves.length,
    onTask,
    inRecovery,
  }
}

export function getOpenAccessRequestsCount(
  accessRequests: readonly AccessRequest[],
): number {
  return accessRequests.filter((request) => request.status === 'open').length
}

export function getBuildingCounts(
  buildings: readonly BuildingState[],
): BuildingCounts {
  let outposts = 0
  let depots = 0
  for (const building of buildings) {
    if (building.type === 'outpost') {
      outposts += 1
    } else if (building.type === 'depot') {
      depots += 1
    }
  }
  return { outposts, depots }
}

export function getMainStockpileSummary(world: World): StockpileSummary {
  const stockpile = getPrimaryStockpile(world)
  const stored = Object.values(stockpile?.storage?.inventory ?? {}).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  )
  const capacity = stockpile?.storage?.capacity ?? 0
  return { stored, capacity }
}

export function getInventoryTotal(inventory: Inventory): number {
  return Object.values(inventory).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  )
}

export function getHudInventorySummary(
  simulation: Pick<SimulationState, 'inventory' | 'dwarves'>,
): { inventory: Inventory; aggregateStored: number } {
  const inventory = getAggregateInventory(simulation)
  const aggregateStored = getInventoryTotal(inventory)
  return { inventory, aggregateStored }
}

export function getColonyStatusChip(
  completed: boolean,
  safetyPhase: SafetyPhase,
): string {
  if (completed) return 'READY TO PRESTIGE'
  if (safetyPhase === 'blocked') return 'COLONY BLOCKED'
  if (safetyPhase === 'bootstrap') return 'BOOTSTRAP SAFETY'
  return 'DIGGING'
}

export function formatSafetySummary(
  safety: Pick<SafetyState, 'phase' | 'blockedReason'>,
): string {
  return `${safety.phase}${
    safety.blockedReason
      ? ` · ${safety.blockedReason.replaceAll('-', ' ')}`
      : ''
  }`
}

export function formatDirectiveSummary(
  policy: Pick<PolicyState, 'workPreference' | 'haulingPreference'>,
  constructionPolicy: ConstructionPolicy,
): string {
  return `${policy.workPreference.replace('-', ' ')} · ${policy.haulingPreference.replace('-', ' ')} · ${constructionPolicy} construction`
}

export function getCenterBiomeDefinition(
  world: Pick<World, 'biomes' | 'width'>,
): BiomeDefinition {
  const centerBiome = world.biomes[Math.floor(world.width / 2)]
  return BIOME_DEFINITIONS[centerBiome]
}

export function getPrestigeSummary(
  simulation: SimulationState,
): PrestigeSummary {
  return {
    currency: simulation.prestigeCurrency,
    canFullClear: canPrestige(simulation, 'full-clear'),
    canRelicReset: canPrestige(simulation, 'relic'),
  }
}

export function getHudViewModel(simulation: SimulationState): HudViewModel {
  const { inventory, aggregateStored } = getHudInventorySummary(simulation)
  return {
    runNumber: simulation.world.runNumber,
    seed: simulation.world.seed,
    tick: simulation.tick,
    statusChip: getColonyStatusChip(
      simulation.completed,
      simulation.safety.phase,
    ),
    inventory,
    aggregateStored,
    remainingSolids: getRemainingSolids(simulation.world),
    openAccessRequests: getOpenAccessRequestsCount(simulation.accessRequests),
    safetySummary: formatSafetySummary(simulation.safety),
  }
}

export function getInspectorViewModel(
  simulation: SimulationState,
): InspectorViewModel {
  const excavation = getExcavationSummary(
    simulation.world,
    simulation.totalCleared,
  )
  const dwarfCounts = getDwarfCounts(simulation.dwarves)
  const biome = getCenterBiomeDefinition(simulation.world)
  const mainStockpile = getMainStockpileSummary(simulation.world)
  const buildingCounts = getBuildingCounts(simulation.world.buildings)
  const storageDiagnostics = getStorageDiagnostics(simulation)
  const openAccessRequests = getOpenAccessRequestsCount(
    simulation.accessRequests,
  )
  const safetySummary = formatSafetySummary(simulation.safety)
  const directiveSummary = formatDirectiveSummary(
    simulation.policy,
    simulation.constructionPolicy,
  )
  const prestige = getPrestigeSummary(simulation)

  return {
    progress: excavation.progress,
    totalCleared: simulation.totalCleared,
    remainingSolids: excavation.remaining,
    dwarfCounts,
    biomeLabel: biome.label,
    discoveredRelics: simulation.discoveredRelics,
    mainStockpile,
    storageDiagnostics,
    buildingCounts,
    constructionCount: simulation.constructionOrders.length,
    openAccessRequests,
    safetySummary,
    directiveSummary,
    prestige,
    upgrades: simulation.upgrades,
  }
}

export function selectHudViewModel(state: GameStore): HudViewModel {
  return getHudViewModel(state.simulation)
}

export function selectInspectorViewModel(state: GameStore): InspectorViewModel {
  return getInspectorViewModel(state.simulation)
}

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { STARTER_EMERGENCY_STONE, STARTER_STONE_SUPPLY } from './content'
import { stepSimulation } from './engine'
import { generateWorld, randomStarterSeed } from './generation'
import {
  canPrestige,
  DEFAULT_UPGRADES,
  purchaseUpgrade,
  startPrestige,
} from './progression'
import { parseSave, serializeState } from './serialization'
import {
  type ConstructionPolicy,
  cloneInventory,
  EMPTY_INVENTORY,
  type PolicyState,
  type PrestigeMode,
  type SimulationState,
  type UpgradeLevels,
} from './types'

export const GAME_STORAGE_KEY = 'pixel-dwarves-digging/save-v2'
export const LEGACY_GAME_STORAGE_KEY = 'pixel-dwarves-digging/save-v1'
export const SIMULATION_TICK_MS = 100
export type SimulationSpeed = 1 | 2 | 4

const DEFAULT_POLICY: PolicyState = {
  workPreference: 'nearest',
  haulingPreference: 'nearest-stockpile',
  materialPriority: { coal: false, iron: false, crystal: false, relic: false },
}

export type GameStore = {
  simulation: SimulationState
  paused: boolean
  speed: SimulationSpeed
  saveStatus: string
  saveError: string | null
  setPaused: (paused: boolean) => void
  setSpeed: (speed: SimulationSpeed) => void
  setPolicy: (policy: Partial<PolicyState>) => void
  setMaterialPriority: (
    material: keyof PolicyState['materialPriority'],
    enabled: boolean,
  ) => void
  setConstructionPolicy: (policy: ConstructionPolicy) => void
  tickSimulation: () => void
  startSimulation: () => void
  stopSimulation: () => void
  saveLocally: () => void
  loadLocalSave: () => boolean
  exportSave: () => string
  importSave: (payload: string) => boolean
  newRun: (seed?: string) => void
  resetProgress: () => void
  prestige: (mode: PrestigeMode) => boolean
  buyUpgrade: (upgrade: keyof UpgradeLevels) => void
}

function createDwarves(
  world: SimulationState['world'],
  count: number,
): SimulationState['dwarves'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `dwarf-${index + 1}`,
    position: { ...world.start },
    movement: 'grounded' as const,
    task: { kind: 'idle' as const, path: [], progress: 0 },
    carrying: null,
  }))
}

export function createInitialSimulation(
  seed: string,
  runNumber = 1,
  upgrades: UpgradeLevels = DEFAULT_UPGRADES,
  prestigeCurrency = 0,
  policy: PolicyState = DEFAULT_POLICY,
  constructionPolicy: ConstructionPolicy = 'balanced',
): SimulationState {
  const world = generateWorld(seed, runNumber, upgrades.prospecting)
  const inventory = cloneInventory(EMPTY_INVENTORY)
  inventory.stone = STARTER_STONE_SUPPLY
  return {
    world,
    dwarves: createDwarves(world, 3 + upgrades.extraBunks),
    inventory,
    policy: {
      ...policy,
      materialPriority: { ...policy.materialPriority },
    },
    constructionOrders: [],
    constructionPolicy,
    accessRequests: [],
    worldRevision: 0,
    safety: {
      phase: 'bootstrap',
      emergencyStone: STARTER_EMERGENCY_STONE,
      noProgressTicks: 0,
    },
    tick: 0,
    totalCleared: 0,
    completed: false,
    discoveredRelics: 0,
    prestigeCurrency,
    upgrades: { ...upgrades },
  }
}

function writeLocalSave(simulation: SimulationState): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(GAME_STORAGE_KEY, serializeState(simulation))
  }
}

export function createGameStore(
  seed = randomStarterSeed(),
): UseBoundStore<StoreApi<GameStore>> {
  let intervalId: ReturnType<typeof setInterval> | undefined

  const store = create<GameStore>((set, get) => ({
    simulation: createInitialSimulation(seed),
    paused: false,
    speed: 1,
    saveStatus: 'UNSAVED',
    saveError: null,
    setPaused: (paused) => set({ paused }),
    setSpeed: (speed) => set({ speed }),
    setPolicy: (policy) =>
      set((current) => ({
        simulation: {
          ...current.simulation,
          policy: {
            ...current.simulation.policy,
            ...policy,
            materialPriority: {
              ...current.simulation.policy.materialPriority,
              ...(policy.materialPriority ?? {}),
            },
          },
          saveStatus: 'DIRTY',
        },
      })),
    setMaterialPriority: (material, enabled) =>
      set((current) => ({
        simulation: {
          ...current.simulation,
          policy: {
            ...current.simulation.policy,
            materialPriority: {
              ...current.simulation.policy.materialPriority,
              [material]: enabled,
            },
          },
          saveStatus: 'DIRTY',
        },
      })),
    setConstructionPolicy: (constructionPolicy) =>
      set((current) => ({
        simulation: { ...current.simulation, constructionPolicy },
        saveStatus: 'DIRTY',
      })),
    tickSimulation: () => {
      const current = get()
      if (current.paused) return
      const simulation = stepSimulation(current.simulation, current.speed)
      const autosaved = simulation.tick % 20 === 0
      set({ simulation, saveStatus: autosaved ? 'SAVED' : 'DIRTY' })
      if (autosaved) writeLocalSave(simulation)
    },
    startSimulation: () => {
      if (intervalId) return
      intervalId = setInterval(() => get().tickSimulation(), SIMULATION_TICK_MS)
    },
    stopSimulation: () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = undefined
      }
    },
    saveLocally: () => {
      writeLocalSave(get().simulation)
      set({ saveStatus: 'SAVED', saveError: null })
    },
    loadLocalSave: () => {
      if (typeof window === 'undefined' || !window.localStorage) return false
      const payload =
        window.localStorage.getItem(GAME_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_GAME_STORAGE_KEY)
      if (!payload) return false
      return get().importSave(payload)
    },
    exportSave: () => {
      const payload = serializeState(get().simulation)
      set({ saveStatus: 'EXPORTED', saveError: null })
      return payload
    },
    importSave: (payload) => {
      const result = parseSave(payload)
      if ('error' in result) {
        set({ saveError: result.error, saveStatus: 'IMPORT FAILED' })
        return false
      }
      set({
        simulation: result.state,
        saveError: null,
        saveStatus:
          result.recoveredAccessOrders && result.recoveredAccessOrders > 0
            ? 'IMPORTED WITH RECOVERY'
            : 'IMPORTED',
      })
      writeLocalSave(result.state)
      return true
    },
    newRun: (nextSeed = randomStarterSeed()) => {
      const current = get().simulation
      set({
        simulation: createInitialSimulation(
          nextSeed,
          current.world.runNumber + 1,
          current.upgrades,
          current.prestigeCurrency,
          current.policy,
          current.constructionPolicy,
        ),
        saveStatus: 'NEW RUN',
        saveError: null,
      })
    },
    resetProgress: () => {
      set({
        simulation: createInitialSimulation(randomStarterSeed()),
        saveStatus: 'RESET',
        saveError: null,
      })
    },
    prestige: (mode) => {
      const current = get().simulation
      if (!canPrestige(current, mode)) return false
      const simulation = startPrestige(current, mode)
      set({ simulation, saveStatus: 'PRESTIGED', saveError: null })
      writeLocalSave(simulation)
      return true
    },
    buyUpgrade: (upgrade) => {
      const simulation = purchaseUpgrade(get().simulation, upgrade)
      set({ simulation, saveError: null, saveStatus: 'SAVED' })
      writeLocalSave(simulation)
    },
  }))

  store.getState().loadLocalSave()

  return store
}

export const useGameStore = createGameStore()

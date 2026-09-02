import { describe, expect, it } from 'vitest'
import {
  formatDirectiveSummary,
  formatSafetySummary,
  getBuildingCounts,
  getCenterBiomeDefinition,
  getColonyStatusChip,
  getDwarfCounts,
  getExcavationProgress,
  getExcavationSummary,
  getHudInventorySummary,
  getHudViewModel,
  getInspectorViewModel,
  getInventoryTotal,
  getMainStockpileSummary,
  getOpenAccessRequestsCount,
  getPrestigeSummary,
  getRemainingSolids,
  selectHudViewModel,
  selectInspectorViewModel,
} from './selectors'
import { createInitialSimulation } from './state'
import type { AccessRequest, DwarfState, Inventory, World } from './types'

const mockWorld: World = {
  width: 4,
  height: 4,
  seed: 'test-seed',
  runNumber: 1,
  cells: [
    { block: 'stone', biome: 'meadow' },
    { block: 'stone', biome: 'meadow' },
    { block: 'air', biome: 'meadow' },
    { block: 'air', biome: 'meadow' },
    { block: 'iron', biome: 'desert' },
    { block: 'coal', biome: 'desert' },
    { block: 'air', biome: 'desert' },
    { block: 'air', biome: 'desert' },
    { block: 'air', biome: 'red-rock' },
    { block: 'air', biome: 'red-rock' },
    { block: 'air', biome: 'red-rock' },
    { block: 'air', biome: 'red-rock' },
    { block: 'bedrock', biome: 'frozen' },
    { block: 'bedrock', biome: 'frozen' },
    { block: 'bedrock', biome: 'frozen' },
    { block: 'bedrock', biome: 'frozen' },
  ],
  surfaceHeights: [2, 2, 2, 2],
  biomes: ['meadow', 'desert', 'red-rock', 'frozen'],
  start: { x: 1, y: 1 },
  stockpile: { x: 0, y: 0 },
  buildings: [
    {
      id: 'main-stockpile',
      type: 'stockpile',
      position: { x: 0, y: 0 },
      width: 2,
      height: 1,
      level: 1,
      construction: 'completed',
      storage: {
        capacity: 50,
        inventory: { stone: 15, iron: 5 },
      },
    },
    {
      id: 'outpost-1',
      type: 'outpost',
      position: { x: 2, y: 0 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
    },
    {
      id: 'depot-1',
      type: 'depot',
      position: { x: 3, y: 0 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
    },
    {
      id: 'depot-2',
      type: 'depot',
      position: { x: 3, y: 1 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    },
    {
      id: 'ladder-1',
      type: 'ladder',
      position: { x: 1, y: 2 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'completed',
    },
  ],
}

describe('excavation selectors', () => {
  it('counts remaining non-air, non-bedrock solids in the world', () => {
    // 2 stone + 1 iron + 1 coal = 4 mineable solids
    expect(getRemainingSolids(mockWorld)).toBe(4)
  })

  it('calculates excavation progress percentage correctly', () => {
    expect(getExcavationProgress(0, 0)).toBe(100)
    expect(getExcavationProgress(0, 50)).toBe(100)
    expect(getExcavationProgress(100, 0)).toBe(0)
    expect(getExcavationProgress(25, 75)).toBe(75)
    expect(getExcavationProgress(1, 2)).toBe(67) // Math.round(2 / 3 * 100)
  })

  it('returns full excavation summary', () => {
    const summary = getExcavationSummary(mockWorld, 6)
    expect(summary).toEqual({
      remaining: 4,
      totalCleared: 6,
      total: 10,
      progress: 60,
    })
  })
})

describe('dwarf & colony selectors', () => {
  it('counts total, active, and recovery dwarves in a single pass', () => {
    const dwarves: DwarfState[] = [
      {
        id: 'd1',
        position: { x: 0, y: 0 },
        movement: 'grounded',
        task: { kind: 'idle', path: [], progress: 0 },
        carrying: null,
      },
      {
        id: 'd2',
        position: { x: 1, y: 1 },
        movement: 'grounded',
        task: { kind: 'dig', path: [], progress: 50 },
        carrying: null,
      },
      {
        id: 'd3',
        position: { x: 2, y: 2 },
        movement: 'stranded',
        task: { kind: 'idle', path: [], progress: 0 },
        carrying: null,
      },
      {
        id: 'd4',
        position: { x: 3, y: 3 },
        movement: 'grounded',
        task: { kind: 'build', path: [], progress: 0, purpose: 'recovery' },
        carrying: null,
      },
    ]

    const counts = getDwarfCounts(dwarves)
    expect(counts).toEqual({
      total: 4,
      onTask: 2, // d2 (dig) and d4 (build)
      inRecovery: 2, // d3 (stranded) and d4 (purpose: recovery)
    })
  })

  it('counts open access requests', () => {
    const requests: AccessRequest[] = [
      {
        id: 'req-1',
        target: { x: 0, y: 0 },
        failure: 'support',
        priority: 1,
        worldRevision: 0,
        status: 'open',
      },
      {
        id: 'req-2',
        target: { x: 1, y: 1 },
        failure: 'storage-route',
        priority: 2,
        worldRevision: 0,
        status: 'resolved',
      },
      {
        id: 'req-3',
        target: { x: 2, y: 2 },
        failure: 'return-route',
        priority: 3,
        worldRevision: 0,
        status: 'open',
      },
      {
        id: 'req-4',
        target: { x: 3, y: 3 },
        failure: 'support',
        priority: 4,
        worldRevision: 0,
        status: 'blocked',
      },
    ]

    expect(getOpenAccessRequestsCount(requests)).toBe(2)
  })
})

describe('building & storage selectors', () => {
  it('counts outposts and depots from buildings array', () => {
    const counts = getBuildingCounts(mockWorld.buildings)
    expect(counts).toEqual({
      outposts: 1,
      depots: 2,
    })
  })

  it('returns main stockpile summary with stored count and capacity', () => {
    const summary = getMainStockpileSummary(mockWorld)
    expect(summary).toEqual({
      stored: 20, // 15 stone + 5 iron
      capacity: 50,
    })
  })

  it('handles world without stockpile gracefully', () => {
    const emptyWorld: World = {
      ...mockWorld,
      buildings: [],
    }
    expect(getMainStockpileSummary(emptyWorld)).toEqual({
      stored: 0,
      capacity: 0,
    })
  })

  it('computes total inventory count', () => {
    const inventory: Inventory = {
      grass: 1,
      dirt: 2,
      sand: 0,
      sandstone: 0,
      'red-stone': 0,
      snow: 0,
      'packed-soil': 0,
      ice: 0,
      mushroom: 0,
      loam: 0,
      clay: 0,
      stone: 10,
      coal: 3,
      iron: 4,
      crystal: 5,
      relic: 1,
    }
    expect(getInventoryTotal(inventory)).toBe(26)
  })

  it('aggregates hud inventory from world storage and carrying dwarves', () => {
    const simulation = createInitialSimulation('hud-inv-seed')
    simulation.dwarves[0].carrying = 'coal'
    const { inventory, aggregateStored } = getHudInventorySummary(simulation)

    expect(inventory.coal).toBe(1)
    expect(inventory.stone).toBe(2)
    expect(aggregateStored).toBe(3)
  })
})

describe('formatting & directive selectors', () => {
  it('formats colony status chips correctly', () => {
    expect(getColonyStatusChip(true, 'operational')).toBe('READY TO PRESTIGE')
    expect(getColonyStatusChip(false, 'blocked')).toBe('COLONY BLOCKED')
    expect(getColonyStatusChip(false, 'bootstrap')).toBe('BOOTSTRAP SAFETY')
    expect(getColonyStatusChip(false, 'operational')).toBe('DIGGING')
  })

  it('formats safety summary with or without blockedReason', () => {
    expect(formatSafetySummary({ phase: 'bootstrap' })).toBe('bootstrap')
    expect(
      formatSafetySummary({
        phase: 'blocked',
        blockedReason: 'waiting-for-stone',
      }),
    ).toBe('blocked · waiting for stone')
  })

  it('formats directive summary from policies', () => {
    expect(
      formatDirectiveSummary(
        {
          workPreference: 'ore-first',
          haulingPreference: 'nearest-stockpile',
        },
        'expand',
      ),
    ).toBe('ore first · nearest stockpile · expand construction')
  })

  it('resolves center biome definition', () => {
    const biome = getCenterBiomeDefinition(mockWorld)
    // mockWorld width=4, Math.floor(4/2)=2 -> biomes[2] = 'red-rock'
    expect(biome.label).toBe('Red-rock')
    expect(biome.surface).toBe('red-stone')
  })
})

describe('prestige selectors', () => {
  it('derives prestige summary', () => {
    const simulation = createInitialSimulation('prestige-seed')
    simulation.prestigeCurrency = 42

    const summary = getPrestigeSummary(simulation)
    expect(summary).toEqual({
      currency: 42,
      canFullClear: false,
      canRelicReset: false,
    })
  })
})

describe('view model selectors', () => {
  it('constructs HudViewModel correctly', () => {
    const simulation = createInitialSimulation('hud-vm-seed')
    simulation.tick = 45

    const hudVm = getHudViewModel(simulation)
    expect(hudVm.runNumber).toBe(1)
    expect(hudVm.seed).toBe('hud-vm-seed')
    expect(hudVm.tick).toBe(45)
    expect(hudVm.statusChip).toBe('BOOTSTRAP SAFETY')
    expect(hudVm.inventory.stone).toBe(2)
    expect(hudVm.aggregateStored).toBe(2)
    expect(hudVm.remainingSolids).toBeGreaterThan(0)
    expect(hudVm.openAccessRequests).toBe(0)
    expect(hudVm.safetySummary).toBe('bootstrap')
  })

  it('constructs InspectorViewModel correctly', () => {
    const simulation = createInitialSimulation('inspector-vm-seed')
    simulation.totalCleared = 10

    const inspectorVm = getInspectorViewModel(simulation)
    expect(inspectorVm.totalCleared).toBe(10)
    expect(inspectorVm.progress).toBe(0)
    expect(inspectorVm.dwarfCounts.total).toBe(3)
    expect(inspectorVm.dwarfCounts.onTask).toBe(0)
    expect(inspectorVm.dwarfCounts.inRecovery).toBe(0)
    expect(inspectorVm.buildingCounts.outposts).toBe(0)
    expect(inspectorVm.mainStockpile.stored).toBe(2)
    expect(inspectorVm.storageDiagnostics.totalCapacity).toBeGreaterThan(0)
    expect(inspectorVm.directiveSummary).toBe(
      'nearest · nearest stockpile · balanced construction',
    )
    expect(inspectorVm.prestige.currency).toBe(0)
    expect(inspectorVm.upgrades.toolPower).toBe(0)
  })

  it('works with Zustand state wrapper selectors', () => {
    const simulation = createInitialSimulation('state-vm-seed')
    const mockStore = {
      simulation,
      paused: false,
      speed: 1 as const,
      dynamicCameraEnabled: true,
      saveStatus: 'SAVED',
      saveError: null,
      setPaused: () => {},
      setSpeed: () => {},
      setDynamicCameraEnabled: () => {},
      setPolicy: () => {},
      setMaterialPriority: () => {},
      setConstructionPolicy: () => {},
      tickSimulation: () => {},
      startSimulation: () => {},
      stopSimulation: () => {},
      saveLocally: () => {},
      loadLocalSave: () => false,
      exportSave: () => '',
      importSave: () => false,
      newRun: () => {},
      resetProgress: () => {},
      prestige: () => false,
      buyUpgrade: () => {},
    }

    expect(selectHudViewModel(mockStore).seed).toBe('state-vm-seed')
    expect(selectInspectorViewModel(mockStore).dwarfCounts.total).toBe(3)
  })

  it('provides stable snapshot references when simulation identity does not change', () => {
    const simulation = createInitialSimulation('snapshot-stability-seed')
    const hud1 = getHudViewModel(simulation)
    const hud2 = getHudViewModel(simulation)
    expect(hud1).toBe(hud2)

    const inspector1 = getInspectorViewModel(simulation)
    const inspector2 = getInspectorViewModel(simulation)
    expect(inspector1).toBe(inspector2)
  })
})

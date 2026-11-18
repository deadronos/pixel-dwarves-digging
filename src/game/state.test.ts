import { beforeEach, describe, expect, it } from 'vitest'
import { STARTER_DWARVES } from './content'
import { createGameStore, GAME_STORAGE_KEY } from './state'

beforeEach(() => {
  window.localStorage.clear()
})

describe('createGameStore', () => {
  it('starts a deterministic run with default policies', () => {
    const store = createGameStore('state-seed')
    const state = store.getState()

    expect(state.simulation.world.seed).toBe('state-seed')
    expect(state.simulation.policy.workPreference).toBe('nearest')
    expect(state.simulation.dwarves).toHaveLength(STARTER_DWARVES)
    expect(state.dynamicCameraEnabled).toBe(true)
  })

  it('toggles dynamic camera without changing simulation or save data', () => {
    const store = createGameStore('dynamic-camera-state-seed')
    const simulation = store.getState().simulation

    store.getState().setDynamicCameraEnabled(false)

    expect(store.getState().dynamicCameraEnabled).toBe(false)
    expect(store.getState().simulation).toBe(simulation)
    expect(JSON.stringify(store.getState().simulation)).not.toContain(
      'dynamicCamera',
    )
  })

  it('increments the run number for each manual new run', () => {
    const store = createGameStore('run-one')

    store.getState().newRun('run-two')
    expect(store.getState().simulation.world.runNumber).toBe(2)

    store.getState().newRun('run-three')
    expect(store.getState().simulation.world.runNumber).toBe(3)
  })

  it('starts with empty access planning state and no active task purpose', () => {
    const state = createGameStore('access-state-seed').getState().simulation

    expect(state.accessRequests).toEqual([])
    expect(state.worldRevision).toBe(0)
    expect(state.dwarves[0].task.purpose).toBeUndefined()
  })

  it('starts with bootstrap protection and a reserved emergency stone block', () => {
    const state = createGameStore('bootstrap-state-seed').getState().simulation
    const stockpile = state.world.buildings.find(
      (building) => building.type === 'stockpile',
    )

    expect(state.safety).toEqual({
      phase: 'bootstrap',
      emergencyStone: 1,
      noProgressTicks: 0,
    })
    expect(state.inventory.stone).toBe(2)
    expect(stockpile?.storage?.inventory.stone).toBe(2)
  })

  it('advances only when unpaused', () => {
    const store = createGameStore('pause-test')
    store.getState().setPaused(true)
    store.getState().tickSimulation()
    expect(store.getState().simulation.tick).toBe(0)

    store.getState().setPaused(false)
    store.getState().tickSimulation()
    expect(store.getState().simulation.tick).toBe(1)
  })

  it.each([1, 2, 4] as const)(
    'advances %i ticks at the selected speed',
    (speed) => {
      const store = createGameStore('speed-test')
      store.getState().setPaused(false)
      store.getState().setSpeed(speed)
      store.getState().tickSimulation()

      expect(store.getState().simulation.tick).toBe(speed)
    },
  )

  it('updates a policy without replacing unrelated state', () => {
    const store = createGameStore('policy-test')
    const worldBefore = store.getState().simulation.world

    store.getState().setPolicy({ workPreference: 'ore-first' })

    expect(store.getState().simulation.policy.workPreference).toBe('ore-first')
    expect(store.getState().simulation.world).toBe(worldBefore)
  })

  it('updates construction policy without replacing the world', () => {
    const store = createGameStore('construction-policy-test')
    const worldBefore = store.getState().simulation.world

    store.getState().setConstructionPolicy('expand')

    expect(store.getState().simulation.constructionPolicy).toBe('expand')
    expect(store.getState().simulation.world).toBe(worldBefore)
  })

  it('exports and imports the active save', () => {
    const store = createGameStore('save-test')
    const exported = store.getState().exportSave()

    store.getState().newRun('other-seed')
    expect(store.getState().simulation.world.seed).toBe('other-seed')

    expect(store.getState().importSave(exported)).toBe(true)
    expect(store.getState().simulation.world.seed).toBe('save-test')
  })

  it('marks an imported save when it repaired an orphaned access order', () => {
    const store = createGameStore('recovery-save-test')
    const parsed = JSON.parse(store.getState().exportSave()) as {
      schemaVersion: number
      state: ReturnType<typeof store.getState>['simulation']
    }
    parsed.state.world.buildings.push({
      id: 'orphaned-access-ladder',
      type: 'ladder',
      position: { x: 10, y: 10 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned',
    })
    parsed.state.constructionOrders = [
      {
        id: 'orphaned-access-order',
        buildingId: 'orphaned-access-ladder',
        type: 'ladder',
        required: { stone: 1 },
        reserved: {},
        delivered: {},
        progress: 0,
        reason: 'access',
        accessRequestId: 'missing-access-request',
      },
    ]

    expect(store.getState().importSave(JSON.stringify(parsed))).toBe(true)
    expect(store.getState().saveStatus).toBe('IMPORTED WITH RECOVERY')
    expect(store.getState().simulation.constructionOrders).toEqual([])
  })

  it('restores the latest local save when a fresh store starts', () => {
    const saved = createGameStore('saved-seed')
    saved.getState().saveLocally()

    const fresh = createGameStore('fresh-seed')

    expect(fresh.getState().simulation.world.seed).toBe('saved-seed')
    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toContain(
      'saved-seed',
    )
  })

  it('persists a manual new run immediately', () => {
    const store = createGameStore('before-new-run-seed')

    store.getState().newRun('after-new-run-seed')

    expect(store.getState().simulation.world.seed).toBe('after-new-run-seed')
    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toContain(
      'after-new-run-seed',
    )
  })

  it('persists a reset immediately', () => {
    const store = createGameStore('before-reset-seed')

    store.getState().resetProgress()

    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toContain(
      store.getState().simulation.world.seed,
    )
    expect(store.getState().simulation.world.seed).not.toBe('before-reset-seed')
  })

  it('marks the save dirty after the simulation advances', () => {
    const store = createGameStore('dirty-save-seed')
    store.getState().saveLocally()
    expect(store.getState().saveStatus).toBe('SAVED')

    store.getState().tickSimulation()

    expect(store.getState().saveStatus).toBe('DIRTY')
  })

  it('keeps saveStatus stable between autosaves and flips it on the autosave tick', () => {
    const store = createGameStore('save-status-churn-seed')
    store.getState().saveLocally()

    store.getState().tickSimulation()
    expect(store.getState().saveStatus).toBe('DIRTY')
    store.getState().tickSimulation()
    expect(store.getState().saveStatus).toBe('DIRTY')

    while (store.getState().simulation.tick < 20) {
      store.getState().tickSimulation()
    }
    expect(store.getState().saveStatus).toBe('SAVED')

    store.getState().tickSimulation()
    expect(store.getState().saveStatus).toBe('DIRTY')
  })

  it('writes and reloads an autosave when 4× steps over the save boundary', () => {
    const store = createGameStore('autosave-speed-switch')
    store.getState().saveLocally()
    const savedAtStart = window.localStorage.getItem(GAME_STORAGE_KEY)
    store.getState().tickSimulation()
    store.getState().setSpeed(4)

    for (let index = 0; index < 4; index += 1) store.getState().tickSimulation()
    expect(store.getState().simulation.tick).toBe(17)
    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toBe(savedAtStart)

    store.getState().tickSimulation()

    expect(store.getState().simulation.tick).toBe(21)
    expect(store.getState().saveStatus).toBe('SAVED')
    expect(createGameStore('reload').getState().simulation.tick).toBe(21)
  })

  it('preserves the active simulation and persisted bytes after a rejected import', () => {
    const store = createGameStore('reject-import')
    store.getState().saveLocally()
    const saved = window.localStorage.getItem(GAME_STORAGE_KEY)
    store.getState().tickSimulation()
    const active = store.getState().simulation

    expect(store.getState().importSave('{"schemaVersion":5}')).toBe(false)
    expect(store.getState().simulation).toBe(active)
    expect(window.localStorage.getItem(GAME_STORAGE_KEY)).toBe(saved)
  })

  it('marks the top-level save status as dirty when updating work preference', () => {
    const store = createGameStore('policy-work-pref-seed')
    store.getState().saveLocally()
    expect(store.getState().saveStatus).toBe('SAVED')

    store.getState().setPolicy({ workPreference: 'ore-first' })

    expect(store.getState().saveStatus).toBe('DIRTY')
    expect(
      'saveStatus' in
        (store.getState().simulation as unknown as Record<string, unknown>),
    ).toBe(false)
  })

  it('marks the top-level save status as dirty when updating hauling preference', () => {
    const store = createGameStore('policy-hauling-pref-seed')
    store.getState().saveLocally()
    expect(store.getState().saveStatus).toBe('SAVED')

    store.getState().setPolicy({ haulingPreference: 'finish-current-route' })

    expect(store.getState().saveStatus).toBe('DIRTY')
    expect(
      'saveStatus' in
        (store.getState().simulation as unknown as Record<string, unknown>),
    ).toBe(false)
  })

  it('marks the top-level save status as dirty when updating material priority', () => {
    const store = createGameStore('material-priority-seed')
    store.getState().saveLocally()
    expect(store.getState().saveStatus).toBe('SAVED')

    store.getState().setMaterialPriority('iron', true)

    expect(store.getState().saveStatus).toBe('DIRTY')
    expect(store.getState().simulation.policy.materialPriority.iron).toBe(true)
    expect(
      'saveStatus' in
        (store.getState().simulation as unknown as Record<string, unknown>),
    ).toBe(false)
  })

  it('marks the top-level save status as dirty when updating construction policy', () => {
    const store = createGameStore('construction-policy-dirty-seed')
    store.getState().saveLocally()
    expect(store.getState().saveStatus).toBe('SAVED')

    store.getState().setConstructionPolicy('conserve')

    expect(store.getState().saveStatus).toBe('DIRTY')
    expect(store.getState().simulation.constructionPolicy).toBe('conserve')
    expect(
      'saveStatus' in
        (store.getState().simulation as unknown as Record<string, unknown>),
    ).toBe(false)
  })

  it('strips stray saveStatus when importing a polluted save payload', () => {
    const store = createGameStore('import-polluted-seed')
    const exported = JSON.parse(store.getState().exportSave()) as {
      schemaVersion: number
      state: Record<string, unknown>
    }
    exported.state.saveStatus = 'DIRTY'

    expect(store.getState().importSave(JSON.stringify(exported))).toBe(true)
    expect(
      'saveStatus' in
        (store.getState().simulation as unknown as Record<string, unknown>),
    ).toBe(false)
    expect(store.getState().saveStatus).toBe('IMPORTED')
  })

  it('strips stray saveStatus when initializing store from a polluted local save', () => {
    const store = createGameStore('local-polluted-seed')
    const exported = JSON.parse(store.getState().exportSave()) as {
      schemaVersion: number
      state: Record<string, unknown>
    }
    exported.state.saveStatus = 'DIRTY'
    window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(exported))

    const freshStore = createGameStore('fresh-init-seed')
    expect(
      'saveStatus' in
        (freshStore.getState().simulation as unknown as Record<
          string,
          unknown
        >),
    ).toBe(false)
    expect(freshStore.getState().simulation.world.seed).toBe(
      'local-polluted-seed',
    )
  })
})

it('persists the shipment mode while paused and resets the count with a new run', () => {
  const store = createGameStore('shipping-settings')
  store.getState().setPaused(true)
  store.getState().setShipmentMode('spoil')
  const loaded = createGameStore('unused').getState().simulation
  expect(loaded.shipments).toEqual({ mode: 'spoil', shipped: 0 })

  store.setState({
    simulation: { ...loaded, shipments: { mode: 'spoil', shipped: 24 } },
  })
  store.getState().setShipmentMode('off')
  expect(store.getState().simulation.shipments).toEqual({
    mode: 'off',
    shipped: 24,
  })
  store.getState().newRun('another-mine')
  expect(store.getState().simulation.shipments).toEqual({
    mode: 'off',
    shipped: 0,
  })
})

it('keeps logistics directives and clears their ledgers when starting another mine', () => {
  const store = createGameStore('new-logistics-controls')
  store.getState().setFreightEnabled(true)
  store.getState().setWorkshopEnabled(true)
  store.getState().setSecondCrew(true)

  const loaded = createGameStore('unused').getState().simulation
  expect(loaded).toMatchObject({
    freight: { enabled: true, moved: 0 },
    workshop: { enabled: true, produced: 0 },
    secondCrew: true,
  })

  store.setState({
    simulation: {
      ...loaded,
      freight: { enabled: true, moved: 20, depotId: 'old-depot' },
      workshop: { enabled: true, produced: 5 },
      discoveredRelics: 1,
    },
  })
  expect(store.getState().prestige('relic')).toBe(true)
  const next = store.getState().simulation
  expect(next.freight).toEqual({ enabled: true, moved: 0 })
  expect(next.workshop).toEqual({ enabled: true, produced: 0 })
  expect(next.secondCrew).toBe(true)
})

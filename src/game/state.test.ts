import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(state.simulation.dwarves).toHaveLength(3)
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

  it('respects 1x, 2x, and 4x speed', () => {
    const store = createGameStore('speed-test')
    store.getState().setPaused(false)
    store.getState().setSpeed(4)
    store.getState().tickSimulation()

    expect(store.getState().simulation.tick).toBe(4)
  })

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
})

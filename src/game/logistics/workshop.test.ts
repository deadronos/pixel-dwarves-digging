import { expect, it } from 'vitest'
import { createInitialSimulation } from '../state'
import type {
  BuildingState,
  Inventory,
  MineableBlockType,
  SimulationState,
} from '../types'
import {
  advanceWorkshop,
  getWorkshopStatus,
  WORKSHOP_INTERVAL_TICKS,
} from './workshop'

function addStorage(
  state: SimulationState,
  id: string,
  type: 'depot' | 'outpost',
  inventory: Partial<Inventory>,
  construction: BuildingState['construction'] = 'completed',
) {
  const building: BuildingState = {
    id,
    type,
    position: { x: state.world.buildings.length + 20, y: 40 },
    width: 1,
    height: 1,
    level: 1,
    construction,
    storage: {
      capacity: Object.values(inventory).reduce((sum, count) => sum + count, 0),
      inventory,
    },
  }
  state.world.buildings.push(building)
  for (const [material, count] of Object.entries(inventory)) {
    state.inventory[material as MineableBlockType] += count
  }
  return building
}

function setupWorkshop() {
  const state = createInitialSimulation('workshop-fixture')
  state.workshop = { enabled: true, produced: 0 }
  state.tick = WORKSHOP_INTERVAL_TICKS - 1
  return state
}

it('converts local spoil into stone in a full depot and keeps the two inventories in sync', () => {
  const state = setupWorkshop()
  const stores = { dirt: 10, stone: 2, coal: 3, iron: 4, crystal: 5, relic: 6 }
  const depot = addStorage(state, 'frontier-depot', 'depot', stores)
  const next = advanceWorkshop(state)

  expect(getWorkshopStatus(state)).toMatchObject({
    site: { id: depot.id, type: depot.type, position: depot.position },
    input: 'dirt',
    reason: 'ready',
    ticksUntilProduction: 1,
  })
  expect(next.workshop).toEqual({ enabled: true, produced: 1 })
  expect(next.inventory).toEqual({
    ...state.inventory,
    dirt: 7,
    stone: state.inventory.stone + 1,
  })
  expect(
    next.world.buildings.find(({ id }) => id === depot.id)?.storage?.inventory,
  ).toEqual({
    ...stores,
    dirt: 7,
    stone: 3,
  })
  expect(depot.storage?.inventory).toEqual(stores)
  expect(next.world.buildings[0]).toBe(state.world.buildings[0])
  expect(next.world.cells).toBe(state.world.cells)
  expect(next.world.topologyKey).toBe(state.world.topologyKey)
})

it('leaves the local input available for committed builds and emergency recovery', () => {
  const state = setupWorkshop()
  const depot = addStorage(state, 'frontier-depot', 'depot', { dirt: 10 })
  state.safety.emergencyStone = 2
  state.constructionOrders.push({
    id: 'access-order',
    buildingId: 'ladder',
    type: 'ladder',
    reason: 'access',
    required: { dirt: 5 },
    delivered: { dirt: 1 },
    reserved: { dirt: 2 },
    progress: 0,
  })

  expect(getWorkshopStatus(state)).toMatchObject({
    site: { id: depot.id },
    input: null,
    reason: 'waiting-for-spoil',
  })
  expect(advanceWorkshop(state)).toBe(state)

  const funded = {
    ...state,
    constructionOrders: [],
  }
  expect(advanceWorkshop(funded).inventory.dirt).toBe(7)
})

it('requires enough of one common material at a single completed local store', () => {
  const state = setupWorkshop()
  const depot = addStorage(
    state,
    'incomplete-depot',
    'depot',
    { dirt: 15 },
    'planned',
  )
  expect(getWorkshopStatus(state)).toMatchObject({
    site: null,
    reason: 'no-site',
  })
  expect(advanceWorkshop(state)).toBe(state)

  const outpost = addStorage(state, 'outpost', 'outpost', {
    dirt: 2,
    sand: 2,
    iron: 20,
    relic: 20,
  })
  expect(getWorkshopStatus(state)).toMatchObject({
    site: { id: outpost.id },
    reason: 'waiting-for-spoil',
  })
  expect(advanceWorkshop(state)).toBe(state)
  expect(outpost.storage?.inventory.iron).toBe(20)
  expect(depot.storage?.inventory.dirt).toBe(15)
})

it('alternates stocked sites between batches and keeps the opening tick deterministic', () => {
  const state = setupWorkshop()
  const depot = addStorage(state, 'depot', 'depot', { dirt: 12 })
  const outpost = addStorage(state, 'outpost', 'outpost', { sand: 12 })
  const beforeBatch = { ...state, tick: WORKSHOP_INTERVAL_TICKS - 2 }
  expect(advanceWorkshop(beforeBatch)).toBe(beforeBatch)

  const first = advanceWorkshop(state)
  expect(
    first.world.buildings.find(({ id }) => id === depot.id)?.storage?.inventory,
  ).toEqual({
    dirt: 9,
    stone: 1,
  })
  expect(first.world.buildings.find(({ id }) => id === outpost.id)).toBe(
    outpost,
  )
  const nextBatch = { ...first, tick: WORKSHOP_INTERVAL_TICKS * 2 - 1 }
  expect(getWorkshopStatus(nextBatch).site?.id).toBe(outpost.id)
  const second = advanceWorkshop(nextBatch)
  expect(second.workshop?.produced).toBe(2)
  expect(second.world.buildings.find(({ id }) => id === depot.id)).toBe(
    first.world.buildings.find(({ id }) => id === depot.id),
  )
  expect(
    second.world.buildings.find(({ id }) => id === outpost.id)?.storage
      ?.inventory,
  ).toEqual({
    sand: 9,
    stone: 1,
  })
  expect(getWorkshopStatus(second).site?.id).toBe(depot.id)
})

it('does not run while switched off or after excavation is complete', () => {
  const state = setupWorkshop()
  addStorage(state, 'frontier-depot', 'depot', { dirt: 20 })
  const turnedOff = { ...state, workshop: { enabled: false, produced: 2 } }
  expect(getWorkshopStatus(turnedOff)).toMatchObject({
    produced: 2,
    reason: 'off',
  })
  expect(advanceWorkshop(turnedOff)).toBe(turnedOff)
  const legacy = { ...state, workshop: undefined }
  expect(getWorkshopStatus(legacy)).toMatchObject({
    enabled: false,
    produced: 0,
  })
  expect(advanceWorkshop(legacy)).toBe(legacy)
  const completed = { ...state, completed: true }
  expect(getWorkshopStatus(completed).reason).toBe('completed')
  expect(advanceWorkshop(completed)).toBe(completed)
})

it('compacts bulk stone after protecting the colony stone reserve', () => {
  const state = setupWorkshop()
  const depot = addStorage(state, 'frontier-depot', 'depot', { stone: 40 })
  const next = advanceWorkshop(state)
  expect(next.workshop?.produced).toBe(1)
  expect(next.inventory.stone).toBe(state.inventory.stone - 2)
  expect(
    next.world.buildings.find(({ id }) => id === depot.id)?.storage?.inventory
      .stone,
  ).toBe(38)
})

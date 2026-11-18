import { expect, it } from 'vitest'
import { stepSimulation } from '../engine'
import { parseSave, serializeState } from '../serialization'
import { createInitialSimulation } from '../state'
import { dispatchSurplus, getShipmentStatus } from './shipments'

function loadedStockpile() {
  const state = createInitialSimulation('shipment-fixture')
  const stockpile = state.world.buildings[0]
  stockpile.storage = {
    capacity: 120,
    inventory: { stone: 40, iron: 24, relic: 6, dirt: 8 },
  }
  state.inventory = {
    ...state.inventory,
    stone: 50,
    iron: 24,
    relic: 6,
    dirt: 8,
  }
  state.world.buildings.push({
    ...stockpile,
    id: 'remote-depot',
    type: 'depot',
    storage: { capacity: 24, inventory: { stone: 10 } },
  })
  state.tick = 99
  return state
}

it('dispatches a bounded batch from the surface and preserves the reserve, relics and depot stocks', () => {
  const state = loadedStockpile()
  state.shipments = { mode: 'surplus', shipped: 0 }
  const next = dispatchSurplus(state)
  expect(next.shipments?.shipped).toBe(24)
  expect(next.inventory.stone).toBeGreaterThanOrEqual(25)
  expect(next.inventory.iron).toBeGreaterThanOrEqual(8)
  expect(next.inventory.relic).toBe(6)
  expect(next.world.buildings[1]).toBe(state.world.buildings[1])
  expect(Object.values(next.inventory).reduce((a, b) => a + b, 0)).toBe(64)
  expect(
    Object.values(next.world.buildings[0].storage?.inventory ?? {}).reduce(
      (a, b) => a + b,
      0,
    ),
  ).toBe(54)
  expect(next.world.cells).toBe(state.world.cells)
  expect(getShipmentStatus({ ...next, tick: 100 }).ticksUntilDispatch).toBe(100)
})

it('keeps ore in spoil mode and honors outstanding construction commitments', () => {
  const state = loadedStockpile()
  state.shipments = { mode: 'spoil', shipped: 0 }
  state.constructionOrders.push({
    id: 'pending-bridge',
    buildingId: 'bridge',
    type: 'bridge',
    reason: 'access',
    required: { stone: 20 },
    delivered: {},
    reserved: {},
    progress: 0,
  })
  const next = dispatchSurplus(state)
  expect(next.inventory).toMatchObject({
    stone: 44,
    dirt: 5,
    iron: 24,
    relic: 6,
  })
  expect(next.shipments?.shipped).toBe(9)
})

it('loads the shipment setting and lifetime count and keeps old saves off', () => {
  const state = loadedStockpile()
  state.shipments = { mode: 'spoil', shipped: 7 }
  expect(parseSave(serializeState(state))).toMatchObject({
    state: { shipments: state.shipments },
  })
  const legacy = JSON.parse(serializeState(state))
  legacy.schemaVersion = 5
  delete legacy.state.shipments
  const result = parseSave(JSON.stringify(legacy))
  expect(result).toHaveProperty('state')
  if ('state' in result)
    expect(getShipmentStatus(result.state).mode).toBe('off')
})

it('frees space before dwarves plan their next tick', () => {
  const state = createInitialSimulation('shipment-full')
  state.tick = 99
  state.shipments = { mode: 'spoil', shipped: 0 }
  state.world.buildings[0].storage = { capacity: 120, inventory: { dirt: 120 } }
  state.inventory = { ...state.inventory, stone: 0, dirt: 120 }
  const next = stepSimulation(state)
  expect(next.shipments?.shipped).toBe(24)
  expect(next.world.buildings[0].storage?.inventory.dirt).toBe(96)
  expect(next.dwarves.some(({ task }) => task.kind === 'dig')).toBe(true)
})

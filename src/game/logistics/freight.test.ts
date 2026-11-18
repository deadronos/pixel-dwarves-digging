import { expect, it } from 'vitest'
import { blockToId } from '../blocks'
import { stepSimulation } from '../engine'
import { clearCell } from '../generation'
import { createTopologyKey } from '../pathfinding'
import { createInitialSimulation } from '../state'
import { EMPTY_INVENTORY } from '../types'
import { planOverflowDepotOrder } from './expansionPlanning'
import { advanceFreight, getFreightStatus } from './freight'
import { assessDigSafety } from './safety'
import { selectStorageDestination } from './storage'

function loadedRoute() {
  const state = createInitialSimulation('freight-fixture')
  const width = 50
  const height = 4
  const cells = new Uint8Array(width * height)
  cells.fill(blockToId('stone'), 0, width)
  const start = { x: 1, y: 1 }
  state.world = {
    ...state.world,
    width,
    height,
    cells,
    start,
    stockpile: start,
    surfaceHeights: Array(width).fill(1),
    biomes: Array(width).fill('meadow'),
    topologyKey: createTopologyKey(),
    buildings: [
      {
        id: 'main-stockpile',
        type: 'stockpile',
        position: start,
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
        storage: { capacity: 60, inventory: { stone: 40 } },
      },
      {
        id: 'frontier-depot',
        type: 'depot',
        position: { x: 15, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
        storage: { capacity: 60, inventory: { dirt: 8, iron: 10 } },
      },
    ],
  }
  state.dwarves = []
  state.inventory = { ...EMPTY_INVENTORY, stone: 40, dirt: 8, iron: 10 }
  state.freight = { enabled: true, moved: 0, depotId: 'frontier-depot' }
  state.tick = 19
  return state
}

it('moves at most 12 blocks per transfer without changing colony inventory', () => {
  const state = loadedRoute()
  const next = advanceFreight(state)

  expect(next.inventory).toBe(state.inventory)
  expect(next.world.topologyKey).toBe(state.world.topologyKey)
  expect(next.freight?.moved).toBe(12)
  expect(next.world.buildings[0].storage?.inventory).toEqual({
    stone: 40,
    dirt: 8,
    iron: 4,
  })
  expect(next.world.buildings[1].storage?.inventory).toEqual({
    dirt: 0,
    iron: 6,
  })
  expect(state.world.buildings[1].storage?.inventory).toEqual({
    dirt: 8,
    iron: 10,
  })
})

it('waits for a transfer tick and retains the route when switched off', () => {
  const state = loadedRoute()
  expect(advanceFreight({ ...state, tick: 18 }).freight?.moved).toBe(0)

  const off = {
    ...state,
    freight: { enabled: false, moved: 5, depotId: 'frontier-depot' },
  }
  expect(advanceFreight(off)).toBe(off)
  expect(getFreightStatus(off)).toMatchObject({
    status: 'off',
    moved: 5,
    depotId: 'frontier-depot',
  })
})

it('shows a disconnected route and leaves the load in its depot', () => {
  const state = loadedRoute()
  state.world = clearCell(state.world, { x: 7, y: 0 })

  expect(getFreightStatus(state).status).toBe('disconnected')
  expect(advanceFreight(state)).toBe(state)
})

it('respects loaded dwarf reservations before transferring into the stockpile', () => {
  const state = loadedRoute()
  state.world.buildings[0].storage = { capacity: 45, inventory: { stone: 40 } }
  const target = state.world.buildings[0].position
  state.dwarves = [
    {
      id: 'hauler',
      position: { x: 2, y: 1 },
      movement: 'grounded',
      task: {
        kind: 'haul',
        path: [target],
        target,
        buildingId: 'main-stockpile',
        progress: 0,
      },
      carrying: 'iron',
      carryingCount: 4,
    },
  ]

  const next = advanceFreight(state)
  expect(next.freight?.moved).toBe(1)
  expect(next.world.buildings[0].storage?.inventory.dirt).toBe(1)
  expect(getFreightStatus(next)).toMatchObject({
    availableSlots: 0,
    status: 'backpressure',
  })
})

it('pays once from physically stored stone and preserves construction promises', () => {
  const state = loadedRoute()
  state.freight = { enabled: true, moved: 0 }
  state.safety.emergencyStone = 5
  state.constructionOrders = [
    {
      id: 'pending-bridge',
      buildingId: 'bridge',
      type: 'bridge',
      reason: 'access',
      required: { stone: 29 },
      delivered: {},
      reserved: {},
      progress: 0,
    },
  ]
  expect(getFreightStatus(state).status).toBe('waiting-for-stone')
  expect(advanceFreight(state)).toBe(state)

  state.constructionOrders = []
  expect(getFreightStatus(state).status).toBe('setup')
  const installed = advanceFreight(state)
  expect(installed.inventory.stone).toBe(28)
  expect(installed.world.buildings[0].storage?.inventory.stone).toBe(28)
  expect(installed.freight).toEqual({
    enabled: true,
    moved: 0,
    depotId: 'frontier-depot',
  })
  const next = advanceFreight({ ...installed, tick: 39 })
  expect(next.inventory.stone).toBe(28)
  expect(next.freight?.moved).toBe(12)
})

it('shows starvation after the depot empties', () => {
  const state = loadedRoute()
  state.world.buildings[1].storage = { capacity: 60, inventory: {} }
  state.inventory = { ...EMPTY_INVENTORY, stone: 40 }

  expect(getFreightStatus(state).status).toBe('starved')
  expect(advanceFreight(state)).toBe(state)
})

it('ships first, processes local spoil and transfers freight on a shared dispatch tick', () => {
  const state = loadedRoute()
  state.tick = 99
  state.world.buildings[0].storage = { capacity: 40, inventory: { stone: 40 } }
  state.shipments = { mode: 'surplus', shipped: 0 }
  state.workshop = { enabled: true, produced: 0 }

  const next = stepSimulation(state)
  expect(next.shipments?.shipped).toBe(16)
  expect(next.workshop?.produced).toBe(1)
  expect(next.freight?.moved).toBe(12)
  expect(next.inventory).toMatchObject({ dirt: 5, stone: 25, iron: 10 })
  expect(next.world.buildings[0].storage?.inventory).toMatchObject({
    dirt: 5,
    stone: 25,
    iron: 6,
  })
  expect(next.world.buildings[1].storage?.inventory.iron).toBe(4)
})

it('plans a first service depot near distant work even while shipments leave surface capacity', () => {
  const state = loadedRoute()
  state.tick = 40
  state.freight = { enabled: true, moved: 0 }
  state.constructionPolicy = 'expand'
  state.world.buildings.pop()
  state.world.buildings[0].storage = { capacity: 120, inventory: { stone: 40 } }
  const position = { x: 45, y: 1 }
  state.dwarves = [
    {
      id: 'remote-miner',
      position,
      movement: 'grounded',
      carrying: null,
      task: { kind: 'dig', target: { x: 46, y: 1 }, path: [], progress: 0 },
    },
  ]
  const next = planOverflowDepotOrder(state)
  expect(next.world.buildings.at(-1)).toMatchObject({
    type: 'depot',
    position,
    construction: 'planned',
  })
  expect(next.constructionOrders[0]?.reserved.stone).toBe(4)
})

it('routes new loads through the connected freight depot when it saves a long haul', () => {
  const state = loadedRoute()
  const from = { x: 16, y: 1 }
  expect(selectStorageDestination(state, 'iron', from)?.id).toBe(
    'frontier-depot',
  )
  const disabled = {
    ...state,
    freight: { moved: 0, depotId: 'frontier-depot', enabled: false },
  }
  expect(selectStorageDestination(disabled, 'iron', from)?.id).toBe(
    'main-stockpile',
  )
  expect(selectStorageDestination(state, 'iron', { x: 4, y: 1 })?.id).toBe(
    'main-stockpile',
  )
})

it('feeds spare spoil through the local workshop and keeps ore on the surface route', () => {
  const state = loadedRoute()
  state.freight = undefined
  state.workshop = { enabled: true, produced: 0 }
  const from = { x: 16, y: 1 }
  expect(selectStorageDestination(state, 'dirt', from)?.id).toBe(
    'frontier-depot',
  )
  expect(selectStorageDestination(state, 'iron', from)?.id).toBe(
    'main-stockpile',
  )
})

it('updates the dig preview when the freight directive changes on the same world', () => {
  const state = loadedRoute()
  const stand = { x: 16, y: 1 }
  const target = { x: 17, y: 1 }
  state.world.cells[state.world.width + target.x] = blockToId('iron')
  const off = { ...state, freight: undefined }
  expect(assessDigSafety(off, stand, target).storage?.id).toBe('main-stockpile')
  expect(assessDigSafety(state, stand, target).storage?.id).toBe(
    'frontier-depot',
  )
})

it('keeps one workshop batch at the linked depot before relaying the rest', () => {
  const state = loadedRoute()
  state.workshop = { enabled: true, produced: 0 }
  const next = advanceFreight(state)
  expect(next.freight?.moved).toBe(12)
  expect(next.world.buildings[1].storage?.inventory).toMatchObject({
    dirt: 3,
    iron: 3,
  })
})

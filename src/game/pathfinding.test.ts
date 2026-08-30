import { describe, expect, it } from 'vitest'
import { completeConstruction } from './buildings'
import { addMaterialToStorage, removeFromStorage } from './buildings/storage'
import { clearCell } from './generation'
import {
  createTopologyKey,
  findAdjacentConstructionPaths,
  findPath,
  findReachableExposedSolids,
} from './pathfinding'
import {
  type Cell,
  cloneInventory,
  EMPTY_INVENTORY,
  type SimulationState,
  type World,
} from './types'

function makeWorld(rows: string[]): World {
  const height = rows.length
  const width = rows[0].length
  const cells: Cell[] = rows.flatMap((row) =>
    [...row].map((value) => ({
      block:
        value === '.'
          ? 'air'
          : value === 'b'
            ? 'bedrock'
            : value === 'stone'
              ? 'stone'
              : 'dirt',
      biome: 'meadow',
    })),
  )

  return {
    width,
    height,
    cells,
    seed: 'test',
    runNumber: 1,
    surfaceHeights: Array(width).fill(2),
    biomes: Array(width).fill('meadow'),
    start: { x: 1, y: 1 },
    stockpile: { x: 1, y: 1 },
    buildings: [],
    topologyKey: createTopologyKey(),
  }
}

describe('findPath', () => {
  it('finds a shortest path across a grounded floor', () => {
    const world = makeWorld(['######', '......', '######'])

    expect(findPath(world, { x: 0, y: 1 }, { x: 5, y: 1 })).toEqual(
      Array.from({ length: 5 }, (_, index) => ({ x: index + 1, y: 1 })),
    )
  })

  it('does not route through unsupported open air', () => {
    const world = makeWorld(['##.###', '......', '######'])

    expect(findPath(world, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeNull()
  })

  it('can route through a solid cell when that cell is virtually cleared', () => {
    const world = makeWorld(['######', '..#...', '######'])

    expect(findPath(world, { x: 0, y: 1 }, { x: 5, y: 1 })).toBeNull()
    expect(
      findPath(world, { x: 0, y: 1 }, { x: 5, y: 1 }, { x: 2, y: 1 }),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
    ])
  })

  it('reuses an exact path query for the same world and virtual override', () => {
    const world = makeWorld(['######', '..#...', '######'])
    const first = findPath(
      world,
      { x: 0, y: 1 },
      { x: 5, y: 1 },
      { x: 2, y: 1 },
    )
    const second = findPath(
      world,
      { x: 0, y: 1 },
      { x: 5, y: 1 },
      { x: 2, y: 1 },
    )

    expect(second).toBe(first)
  })

  it('uses a completed bridge across an unsupported gap', () => {
    const world = makeWorld(['##.###', '......', '######'])
    world.buildings = [
      {
        id: 'bridge-1',
        type: 'bridge',
        position: { x: 2, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]

    expect(findPath(world, { x: 1, y: 1 }, { x: 3, y: 1 })).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ])
  })

  it('uses a connected ladder for vertical travel', () => {
    const world = makeWorld(['#####', '.....', '.....'])
    world.buildings = [
      {
        id: 'ladder-1',
        type: 'ladder',
        position: { x: 2, y: 2 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]

    expect(findPath(world, { x: 2, y: 1 }, { x: 2, y: 2 })).toEqual([
      { x: 2, y: 2 },
    ])
  })

  it('finds a supported diagonal path', () => {
    const world = makeWorld(['#####', '.....', '.....', '#####'])
    world.buildings = [
      {
        id: 'bridge-1',
        type: 'bridge',
        position: { x: 1, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
      {
        id: 'bridge-2',
        type: 'bridge',
        position: { x: 2, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
      {
        id: 'bridge-3',
        type: 'bridge',
        position: { x: 1, y: 2 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
      {
        id: 'bridge-4',
        type: 'bridge',
        position: { x: 2, y: 2 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]

    expect(findPath(world, { x: 1, y: 1 }, { x: 2, y: 2 })).toEqual([
      { x: 2, y: 2 },
    ])
  })

  it('finds a diagonal builder stand when cardinal stands are blocked', () => {
    const world = makeWorld(['#####', '.#...', '.#.#.', '#####'])

    expect(
      findAdjacentConstructionPaths(world, { x: 0, y: 1 }, { x: 1, y: 2 }),
    ).toEqual([{ path: [], stand: { x: 0, y: 1 } }])
  })

  it('does not move diagonally through a blocked corner', () => {
    const world = makeWorld(['#####', '#.#.#', '##..#', '#####'])

    expect(findPath(world, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull()
  })

  it('returns exposed solids with shortest paths to a standing cell', () => {
    const world = makeWorld(['#####', '.....', '..d..'])

    expect(findReachableExposedSolids(world, { x: 1, y: 1 })).toContainEqual({
      target: { x: 2, y: 2 },
      path: [],
    })
  })

  it('discovers a diagonally exposed solid target', () => {
    const world = makeWorld(['#####', '.....', '.....', '...d.', '#####'])
    world.buildings = [
      {
        id: 'bridge-1',
        type: 'bridge',
        position: { x: 1, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
      {
        id: 'bridge-2',
        type: 'bridge',
        position: { x: 2, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
      {
        id: 'bridge-3',
        type: 'bridge',
        position: { x: 1, y: 2 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
      {
        id: 'bridge-4',
        type: 'bridge',
        position: { x: 2, y: 2 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
      },
    ]

    expect(findReachableExposedSolids(world, { x: 1, y: 1 })).toContainEqual({
      target: { x: 3, y: 3 },
      path: [{ x: 2, y: 2 }],
    })
  })

  it('does not return the same exposed solid more than once', () => {
    const world = makeWorld(['#####', '.....', '.ddd.', '.d.d.'])
    const targets = findReachableExposedSolids(world, { x: 2, y: 1 })
    const keys = targets.map(({ target }) => `${target.x}:${target.y}`)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('does not expose bedrock as a mining target', () => {
    const world = makeWorld(['bbbbb', '.....', '.....'])

    expect(
      findReachableExposedSolids(world, { x: 1, y: 1 }).some(
        ({ target }) => target.y === 0,
      ),
    ).toBe(false)
  })
})

describe('navigation cache decoupling', () => {
  it('reuses path and reachable solids cache across addMaterialToStorage and removeFromStorage mutations', () => {
    const world = makeWorld(['######', '......', '######'])
    world.buildings = [
      {
        id: 'stockpile-1',
        type: 'stockpile',
        position: { x: 0, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
        storage: {
          capacity: 10,
          inventory: { stone: 0 },
        },
      },
    ]

    const pathBefore = findPath(world, { x: 1, y: 1 }, { x: 5, y: 1 })
    const solidsBefore = findReachableExposedSolids(world, { x: 1, y: 1 })
    expect(pathBefore).not.toBeNull()

    const worldWithMaterial = addMaterialToStorage(
      world,
      'stockpile-1',
      'stone',
    )
    if (!worldWithMaterial) throw new Error('Failed to add material')
    expect(worldWithMaterial).not.toBe(world)

    const pathAfterAdd = findPath(
      worldWithMaterial,
      { x: 1, y: 1 },
      { x: 5, y: 1 },
    )
    expect(pathAfterAdd).toBe(pathBefore)
    expect(
      findReachableExposedSolids(worldWithMaterial, { x: 1, y: 1 }),
    ).toEqual(solidsBefore)

    const worldAfterRemoval = removeFromStorage(worldWithMaterial, 'stone', 1)
    expect(worldAfterRemoval).not.toBe(worldWithMaterial)

    const pathAfterRemove = findPath(
      worldAfterRemoval,
      { x: 1, y: 1 },
      { x: 5, y: 1 },
    )
    expect(pathAfterRemove).toBe(pathBefore)
  })

  it('invalidates path and search caches when terrain is modified with clearCell', () => {
    const world = makeWorld(['######', '.#....', '######'])
    const blockedPath = findPath(world, { x: 0, y: 1 }, { x: 5, y: 1 })
    expect(blockedPath).toBeNull()

    const clearedWorld = clearCell(world, { x: 1, y: 1 })
    expect(clearedWorld).not.toBe(world)

    const openedPath = findPath(clearedWorld, { x: 0, y: 1 }, { x: 5, y: 1 })
    expect(openedPath).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
    ])
  })

  it('invalidates path cache when new building construction is completed', () => {
    const world = makeWorld(['##.###', '......', '######'])
    const bridgeBuilding = {
      id: 'bridge-1',
      type: 'bridge' as const,
      position: { x: 2, y: 0 },
      width: 1,
      height: 1,
      level: 1,
      construction: 'planned' as const,
    }
    world.buildings = [bridgeBuilding]

    const pathBefore = findPath(world, { x: 1, y: 1 }, { x: 3, y: 1 })
    expect(pathBefore).toBeNull()

    const state: SimulationState = {
      world,
      dwarves: [],
      inventory: cloneInventory(EMPTY_INVENTORY),
      policy: {
        workPreference: 'nearest',
        haulingPreference: 'nearest-stockpile',
        materialPriority: {
          coal: true,
          iron: true,
          crystal: true,
          relic: true,
        },
      },
      constructionOrders: [
        {
          id: 'order-1',
          buildingId: 'bridge-1',
          type: 'bridge',
          required: { stone: 1 },
          reserved: {},
          delivered: { stone: 1 },
          progress: 1,
          reason: 'access',
        },
      ],
      constructionPolicy: 'balanced',
      accessRequests: [],
      worldRevision: 0,
      safety: { phase: 'operational', emergencyStone: 0 },
      tick: 0,
      totalCleared: 0,
      prestigeCurrency: 0,
      discoveredRelics: 0,
      completed: false,
      upgrades: {
        toolPower: 0,
        moveSpeed: 0,
        satchel: 0,
        extraBunks: 0,
        prospecting: 0,
      },
    }

    const completedState = completeConstruction(state, 'order-1')
    const pathAfter = findPath(
      completedState.world,
      { x: 1, y: 1 },
      { x: 3, y: 1 },
    )
    expect(pathAfter).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ])
  })

  it('reuses path cache across storage capacity upgrades', () => {
    const world = makeWorld(['######', '......', '######'])
    world.buildings = [
      {
        id: 'stockpile-1',
        type: 'stockpile',
        position: { x: 0, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
        storage: {
          capacity: 10,
          inventory: {},
        },
      },
    ]

    const state: SimulationState = {
      world,
      dwarves: [],
      inventory: cloneInventory(EMPTY_INVENTORY),
      policy: {
        workPreference: 'nearest',
        haulingPreference: 'nearest-stockpile',
        materialPriority: {
          coal: true,
          iron: true,
          crystal: true,
          relic: true,
        },
      },
      constructionOrders: [
        {
          id: 'upgrade-order-1',
          buildingId: 'stockpile-1',
          type: 'stockpile',
          targetLevel: 2,
          required: { stone: 5 },
          reserved: {},
          delivered: { stone: 5 },
          progress: 5,
          reason: 'storage-upgrade',
        },
      ],
      constructionPolicy: 'balanced',
      accessRequests: [],
      worldRevision: 0,
      safety: { phase: 'operational', emergencyStone: 0 },
      tick: 0,
      totalCleared: 0,
      prestigeCurrency: 0,
      discoveredRelics: 0,
      completed: false,
      upgrades: {
        toolPower: 0,
        moveSpeed: 0,
        satchel: 0,
        extraBunks: 0,
        prospecting: 0,
      },
    }

    const pathBefore = findPath(state.world, { x: 1, y: 1 }, { x: 5, y: 1 })
    expect(pathBefore).not.toBeNull()

    const completedState = completeConstruction(state, 'upgrade-order-1')
    expect(completedState.world).not.toBe(state.world)

    const pathAfter = findPath(
      completedState.world,
      { x: 1, y: 1 },
      { x: 5, y: 1 },
    )
    expect(pathAfter).toBe(pathBefore)
  })

  it('backfills topologyKey on legacy/loaded worlds without topologyKey and reuses caches across storage mutations', () => {
    const world = makeWorld(['######', '......', '######'])
    world.buildings = [
      {
        id: 'stockpile-1',
        type: 'stockpile',
        position: { x: 0, y: 1 },
        width: 1,
        height: 1,
        level: 1,
        construction: 'completed',
        storage: {
          capacity: 10,
          inventory: { stone: 0 },
        },
      },
    ]
    delete world.topologyKey
    expect(world.topologyKey).toBeUndefined()

    const path1 = findPath(world, { x: 1, y: 1 }, { x: 5, y: 1 })
    expect(path1).not.toBeNull()
    expect(typeof world.topologyKey).toBe('object')
    expect(world.topologyKey).not.toBeNull()

    const worldAfterAdd = addMaterialToStorage(world, 'stockpile-1', 'stone')
    if (!worldAfterAdd) throw new Error('Failed to add material')
    expect(worldAfterAdd).not.toBe(world)
    expect(worldAfterAdd.topologyKey).toBe(world.topologyKey)

    const path2 = findPath(worldAfterAdd, { x: 1, y: 1 }, { x: 5, y: 1 })
    expect(path2).toBe(path1)
  })

  it('safely recovers from malformed non-object topologyKey values without throwing TypeError', () => {
    const world = makeWorld(['######', '......', '######'])
    // Simulate malformed loaded save values
    for (const invalid of [1, 'invalid', true, null, 0]) {
      ;(world as unknown as { topologyKey: unknown }).topologyKey = invalid
      expect(() => {
        const path = findPath(world, { x: 1, y: 1 }, { x: 5, y: 1 })
        expect(path).not.toBeNull()
      }).not.toThrow()
      expect(typeof world.topologyKey).toBe('object')
      expect(world.topologyKey).not.toBeNull()
    }
  })
})

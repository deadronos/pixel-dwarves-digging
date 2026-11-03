import { describe, expect, it } from 'vitest'
import { BLOCK_ID_LIST, blockToId, getBlock } from './blocks'
import {
  BIOME_IDS,
  MINEABLE_BLOCKS,
  MINERAL_BLOCKS,
  STARTER_STONE_VEIN_LENGTH,
} from './content'
import { stepSimulation } from './engine'
import {
  countMinerals,
  countSolids,
  generateWorld,
  isSolid,
} from './generation'
import { findReachableExposedSolids } from './pathfinding'
import { createInitialSimulation } from './state'

describe('generateWorld', () => {
  it('generates identical terrain for the same seed and run', () => {
    const first = generateWorld('ember-cavern', 1)
    const second = generateWorld('ember-cavern', 1)

    expect(second).toEqual(first)
  })

  it('uses prospecting levels to reveal more minerals in generated terrain', () => {
    const baseline = generateWorld('prospecting-test', 1, 0)
    const prospected = generateWorld('prospecting-test', 1, 4)

    expect(countMinerals(prospected)).toBeGreaterThan(countMinerals(baseline))
  })

  it('creates every requested biome band with its own surface material', () => {
    const world = generateWorld('banded-biomes', 4)
    const seenBiomes = new Set(world.biomes)

    expect(seenBiomes).toEqual(new Set(BIOME_IDS))
    expect(world.surfaceHeights).toHaveLength(world.width)

    for (const x of [8, 40, 72, 104, 136]) {
      expect(isSolid(getBlock(world, x, world.surfaceHeights[x]))).toBe(true)
    }
  })

  it('leaves a walkable start pocket beside an exposed low-tier block', () => {
    const world = generateWorld('starter-pocket', 2)
    const start = getBlock(world, world.start.x, world.start.y)
    const adjacent = [
      getBlock(world, world.start.x + 1, world.start.y),
      getBlock(world, world.start.x - 1, world.start.y),
      getBlock(world, world.start.x, world.start.y + 1),
      getBlock(world, world.start.x, world.start.y - 1),
    ]

    expect(start).toBe('air')
    expect(getBlock(world, world.stockpile.x, world.stockpile.y)).toBe('air')
    expect(adjacent.some((block) => block === 'dirt' || block === 'sand')).toBe(
      true,
    )
  })

  it('creates a deterministic visible level-one stockpile in the starter pocket', () => {
    const world = generateWorld('starter-stockpile', 3)
    const stockpile = world.buildings.find(
      (building) => building.type === 'stockpile',
    )

    expect(stockpile).toEqual(
      expect.objectContaining({
        type: 'stockpile',
        level: 1,
        construction: 'completed',
        width: 3,
        height: 2,
        storage: expect.objectContaining({ capacity: 120 }),
      }),
    )
    expect(stockpile?.position).toEqual({ x: 11, y: world.start.y })
    expect(
      world.cells.filter((id) => id === blockToId('air')).length,
    ).toBeGreaterThan(0)
  })

  it('guarantees a contiguous reachable starter stone vein beside the pocket', () => {
    const world = generateWorld('starter-stone', 1)

    for (let offset = 0; offset < STARTER_STONE_VEIN_LENGTH; offset += 1) {
      expect(getBlock(world, world.start.x + 3 + offset, world.start.y)).toBe(
        'stone',
      )
    }
  })

  it('places at least one mineral in a generated map', () => {
    const world = generateWorld('mineral-pocket', 8)
    const mineralCount = world.cells.filter((id) =>
      MINERAL_BLOCKS.has(BLOCK_ID_LIST[id]),
    ).length

    expect(mineralCount).toBeGreaterThan(0)
  })

  it('generates an indestructible bedrock floor beneath the mineable world', () => {
    const world = generateWorld('bedrock-floor', 1)

    expect(getBlock(world, 0, 0)).toBe('bedrock')
    expect(isSolid('bedrock')).toBe(true)
    expect(MINEABLE_BLOCKS).not.toContain('bedrock')
  })

  it('does not count bedrock as remaining clearable terrain', () => {
    const world = generateWorld('bedrock-count', 1)
    world.cells.fill(blockToId('air'))
    world.cells[0] = blockToId('bedrock')

    expect(countSolids(world)).toBe(0)
  })

  it('keeps the generated bootstrap route playable across deterministic seeds', () => {
    for (let index = 0; index < 200; index += 1) {
      const seed = `review-${index}`
      const initial = createInitialSimulation(seed)
      const reachable = findReachableExposedSolids(
        initial.world,
        initial.world.start,
      )

      expect(
        reachable.some(
          ({ target }) =>
            getBlock(initial.world, target.x, target.y) === 'stone',
        ),
        `${seed} should expose a reachable starter stone block`,
      ).toBe(true)

      if (index < 12) {
        const result = stepSimulation(initial, 300)
        expect(
          result.totalCleared,
          `${seed} should clear starter work within 300 ticks`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the starter frontier reachable after the initial pocket is mined', () => {
    const result = stepSimulation(createInitialSimulation('review-live-0'), 120)

    expect(result.safety.phase).not.toBe('blocked')
    expect(result.totalCleared).toBeGreaterThan(7)
  })

  it('keeps the deterministic fresh-run seed sweep out of permanent no-safe-work', () => {
    for (let index = 0; index < 200; index += 1) {
      const seed = `review-live-${index}`
      const result = stepSimulation(createInitialSimulation(seed), 120)

      expect(
        result.safety.phase === 'blocked' &&
          (result.safety.noProgressTicks ?? 0) > 20,
        `${seed} should keep making progress: ${JSON.stringify(result.safety)}`,
      ).toBe(false)
      expect(
        result.totalCleared,
        `${seed} should clear starter work`,
      ).toBeGreaterThan(7)
    }
  })
})

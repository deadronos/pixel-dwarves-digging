import { describe, expect, it } from 'vitest'
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
  getCell,
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
      const surface = getCell(world, x, world.surfaceHeights[x])
      expect(surface.biome).toBe(world.biomes[x])
      expect(isSolid(surface.block)).toBe(true)
    }
  })

  it('leaves a walkable start pocket beside an exposed low-tier block', () => {
    const world = generateWorld('starter-pocket', 2)
    const start = getCell(world, world.start.x, world.start.y)
    const adjacent = [
      getCell(world, world.start.x + 1, world.start.y),
      getCell(world, world.start.x - 1, world.start.y),
      getCell(world, world.start.x, world.start.y + 1),
      getCell(world, world.start.x, world.start.y - 1),
    ]

    expect(start.block).toBe('air')
    expect(getCell(world, world.stockpile.x, world.stockpile.y).block).toBe(
      'air',
    )
    expect(
      adjacent.some((cell) => cell.block === 'dirt' || cell.block === 'sand'),
    ).toBe(true)
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
      world.cells.filter((cell) => cell.block === 'air').length,
    ).toBeGreaterThan(0)
  })

  it('guarantees a contiguous reachable starter stone vein beside the pocket', () => {
    const world = generateWorld('starter-stone', 1)

    for (let offset = 0; offset < STARTER_STONE_VEIN_LENGTH; offset += 1) {
      expect(
        getCell(world, world.start.x + 3 + offset, world.start.y).block,
      ).toBe('stone')
    }
  })

  it('places at least one mineral in a generated map', () => {
    const world = generateWorld('mineral-pocket', 8)
    const mineralCount = world.cells.filter((cell) =>
      MINERAL_BLOCKS.has(cell.block),
    ).length

    expect(mineralCount).toBeGreaterThan(0)
  })

  it('generates an indestructible bedrock floor beneath the mineable world', () => {
    const world = generateWorld('bedrock-floor', 1)

    expect(getCell(world, 0, 0).block).toBe('bedrock')
    expect(isSolid('bedrock')).toBe(true)
    expect(MINEABLE_BLOCKS).not.toContain('bedrock')
  })

  it('does not count bedrock as remaining clearable terrain', () => {
    const world = generateWorld('bedrock-count', 1)
    world.cells = world.cells.map((cell) => ({ ...cell, block: 'air' }))
    world.cells[0] = { ...world.cells[0], block: 'bedrock' }

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
            getCell(initial.world, target.x, target.y).block === 'stone',
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
})

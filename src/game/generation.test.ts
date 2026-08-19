import { describe, expect, it } from 'vitest'
import { BIOME_IDS, MINERAL_BLOCKS } from './content'
import { generateWorld, getCell, isSolid } from './generation'

describe('generateWorld', () => {
  it('generates identical terrain for the same seed and run', () => {
    const first = generateWorld('ember-cavern', 1)
    const second = generateWorld('ember-cavern', 1)

    expect(second).toEqual(first)
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

  it('places at least one mineral in a generated map', () => {
    const world = generateWorld('mineral-pocket', 8)
    const mineralCount = world.cells.filter((cell) =>
      MINERAL_BLOCKS.has(cell.block),
    ).length

    expect(mineralCount).toBeGreaterThan(0)
  })
})

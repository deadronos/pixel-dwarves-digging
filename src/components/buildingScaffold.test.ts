import { describe, expect, it } from 'vitest'
import { BUILDING_COLORS } from '../game/content'
import type { ConstructionOrder } from '../game/types'
import {
  constructionProgress,
  constructionProgressByBuilding,
  SCAFFOLD_TEXELS_PER_CELL,
  scaffoldPixels,
} from './buildingScaffold'

function texel(
  image: { width: number; height: number; data: Uint8Array },
  x: number,
  y: number,
) {
  const offset = (y * image.width + x) * 4
  return Array.from(image.data.subarray(offset, offset + 4))
}

function inkCount(image: { data: Uint8Array }): number {
  let count = 0
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] > 0) count += 1
  }
  return count
}

const COLOR = BUILDING_COLORS.bridge

describe('scaffold art', () => {
  it('sizes the footprint in texels per cell', () => {
    const image = scaffoldPixels(3, 2, COLOR, 'planned')
    expect(image.width).toBe(3 * SCAFFOLD_TEXELS_PER_CELL)
    expect(image.height).toBe(2 * SCAFFOLD_TEXELS_PER_CELL)
    expect(image.data.length).toBe(image.width * image.height * 4)
  })

  it('draws a dashed outline and leaves the middle empty when planned', () => {
    const image = scaffoldPixels(2, 2, COLOR, 'planned')
    const centre = texel(
      image,
      Math.floor(image.width / 2),
      Math.floor(image.height / 2),
    )
    expect(centre[3]).toBe(0)

    // The outline is dashed, so a corner run of the border is partly empty.
    let borderInk = 0
    for (let x = 0; x < image.width; x += 1) {
      if (texel(image, x, 0)[3] > 0) borderInk += 1
    }
    expect(borderInk).toBeGreaterThan(0)
    expect(borderInk).toBeLessThan(image.width)
  })

  it('adds interior braces once construction has started', () => {
    const planned = scaffoldPixels(2, 2, COLOR, 'planned')
    const started = scaffoldPixels(2, 2, COLOR, 'under-construction')
    expect(inkCount(started)).toBeGreaterThan(inkCount(planned))
  })

  it('uses the building colour, brighter once work has started', () => {
    const planned = scaffoldPixels(2, 2, COLOR, 'planned')
    const started = scaffoldPixels(2, 2, COLOR, 'under-construction')
    const plannedCorner = texel(planned, 0, 0)
    const startedCorner = texel(started, 0, 0)
    expect(
      startedCorner[0] + startedCorner[1] + startedCorner[2],
    ).toBeGreaterThan(plannedCorner[0] + plannedCorner[1] + plannedCorner[2])
  })

  it('stays inside one cell footprints', () => {
    const image = scaffoldPixels(1, 1, COLOR, 'under-construction')
    expect(image.width).toBe(SCAFFOLD_TEXELS_PER_CELL)
    expect(image.height).toBe(SCAFFOLD_TEXELS_PER_CELL)
    expect(inkCount(image)).toBeGreaterThan(0)
  })
})

describe('construction progress', () => {
  function order(
    required: ConstructionOrder['required'],
    delivered: ConstructionOrder['delivered'],
  ): Pick<ConstructionOrder, 'required' | 'delivered'> {
    return { required, delivered }
  }

  it('is zero before anything is delivered', () => {
    expect(constructionProgress(order({ stone: 4 }, {}))).toBe(0)
    expect(constructionProgress(null)).toBe(0)
  })

  it('is the delivered share of the required material', () => {
    expect(constructionProgress(order({ stone: 4 }, { stone: 1 }))).toBe(0.25)
    expect(constructionProgress(order({ stone: 4 }, { stone: 4 }))).toBe(1)
    expect(
      constructionProgress(order({ stone: 2, dirt: 2 }, { stone: 2 })),
    ).toBe(0.5)
  })

  it('clamps over-delivery and treats an empty order as complete', () => {
    expect(constructionProgress(order({ stone: 2 }, { stone: 9 }))).toBe(1)
    expect(constructionProgress(order({}, {}))).toBe(1)
  })

  it('indexes progress by building id, keeping the furthest along', () => {
    const progress = constructionProgressByBuilding([
      {
        id: 'a',
        buildingId: 'b1',
        type: 'bridge',
        reason: 'access',
        progress: 1,
        required: { stone: 4 },
        reserved: {},
        delivered: { stone: 1 },
      },
      {
        id: 'b',
        buildingId: 'b1',
        type: 'bridge',
        reason: 'access',
        progress: 3,
        required: { stone: 4 },
        reserved: {},
        delivered: { stone: 3 },
      },
      {
        id: 'c',
        buildingId: 'b2',
        type: 'ladder',
        reason: 'access',
        progress: 0,
        required: { stone: 1 },
        reserved: {},
        delivered: {},
      },
    ])

    expect(progress.get('b1')).toBe(0.75)
    expect(progress.get('b2')).toBe(0)
    expect(progress.get('missing')).toBeUndefined()
  })
})

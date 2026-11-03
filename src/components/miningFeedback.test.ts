import { describe, expect, it } from 'vitest'
import { cellsFromBlocks } from '../game/blocks'
import { DIG_DURATION } from '../game/content'
import type { DwarfState, World } from '../game/types'
import { collectDigOverlays, digProgressRatio } from './miningFeedback'

function makeWorld(blocks: Parameters<typeof cellsFromBlocks>[0]): World {
  return {
    width: 4,
    height: 2,
    cells: cellsFromBlocks(blocks),
    seed: 'test',
    runNumber: 1,
    surfaceHeights: [1, 1, 1, 1],
    biomes: ['meadow', 'meadow', 'meadow', 'meadow'],
    start: { x: 0, y: 1 },
    stockpile: { x: 0, y: 1 },
    buildings: [],
  }
}

function dwarf(
  id: string,
  task: Partial<DwarfState['task']>,
  position = { x: 0, y: 1 },
): DwarfState {
  return {
    id,
    position,
    movement: 'grounded',
    carrying: null,
    task: { kind: 'idle', path: [], progress: 0, ...task },
  }
}

describe('digProgressRatio', () => {
  it('matches the duration the simulation uses', () => {
    const duration = DIG_DURATION.stone
    expect(digProgressRatio(0, 'stone', 0)).toBe(0)
    expect(digProgressRatio(duration / 2, 'stone', 0)).toBe(0.5)
    expect(digProgressRatio(duration, 'stone', 0)).toBe(1)
  })

  it('shortens with the tool power upgrade, like advanceDig', () => {
    const duration = DIG_DURATION.stone - 2 * 3
    expect(digProgressRatio(duration, 'stone', 3)).toBe(1)
    expect(digProgressRatio(duration - 1, 'stone', 3)).toBeLessThan(1)
  })

  it('never divides by zero or leaves the 0..1 range', () => {
    expect(digProgressRatio(5, 'air', 0)).toBe(1)
    expect(digProgressRatio(-3, 'stone', 0)).toBe(0)
    expect(digProgressRatio(999, 'stone', 0)).toBe(1)
    expect(digProgressRatio(4, 'stone', 999)).toBe(1)
  })
})

describe('collectDigOverlays', () => {
  // 4 x 2 world, row-major from y = 0: stone at (1, 1), iron at (2, 1).
  const world = makeWorld([
    'bedrock',
    'bedrock',
    'bedrock',
    'bedrock',
    'air',
    'stone',
    'iron',
    'air',
  ])

  it('returns one overlay per block being dug', () => {
    const overlays = collectDigOverlays(
      world,
      [
        dwarf('a', {
          kind: 'dig',
          target: { x: 1, y: 1 },
          progress: DIG_DURATION.stone / 2,
        }),
        dwarf('b', {
          kind: 'dig',
          target: { x: 2, y: 1 },
          progress: 2,
        }),
      ],
      0,
    )

    expect(overlays.map((overlay) => overlay.block)).toEqual(['stone', 'iron'])
    expect(overlays[0].ratio).toBeCloseTo(0.5)
    expect(overlays[0].x).toBe(1)
    expect(overlays[0].y).toBe(1)
  })

  it('ignores dwarves that are not digging', () => {
    const overlays = collectDigOverlays(
      world,
      [
        dwarf('a', { kind: 'haul', target: { x: 1, y: 1 } }),
        dwarf('b', { kind: 'idle' }),
      ],
      0,
    )
    expect(overlays).toEqual([])
  })

  it('ignores targets that are no longer solid', () => {
    const overlays = collectDigOverlays(
      world,
      [
        dwarf('a', { kind: 'dig', target: { x: 0, y: 1 }, progress: 3 }),
        dwarf('b', { kind: 'dig', target: { x: 0, y: 0 }, progress: 3 }),
      ],
      0,
    )
    expect(overlays).toEqual([])
  })

  it('keeps the deepest crack when two dwarves share a block', () => {
    const overlays = collectDigOverlays(
      world,
      [
        dwarf('a', { kind: 'dig', target: { x: 1, y: 1 }, progress: 2 }),
        dwarf('b', { kind: 'dig', target: { x: 1, y: 1 }, progress: 8 }),
      ],
      0,
    )
    expect(overlays.length).toBe(1)
    expect(overlays[0].ratio).toBeGreaterThan(0.5)
  })

  it('stages the crack from the progress ratio', () => {
    const early = collectDigOverlays(
      world,
      [dwarf('a', { kind: 'dig', target: { x: 1, y: 1 }, progress: 1 })],
      0,
    )
    const late = collectDigOverlays(
      world,
      [
        dwarf('a', {
          kind: 'dig',
          target: { x: 1, y: 1 },
          progress: DIG_DURATION.stone - 1,
        }),
      ],
      0,
    )
    expect(late[0].stage).toBeGreaterThan(early[0].stage)
  })
})

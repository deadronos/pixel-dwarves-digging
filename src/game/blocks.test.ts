import { describe, expect, it } from 'vitest'
import {
  BLOCK_ID_LIST,
  BLOCK_IDS,
  blockAt,
  cellsFromBlocks,
  decodeCells,
  encodeCells,
  getBlock,
  idToBlock,
} from './blocks'
import { BLOCK_COLORS } from './content'
import { clearCell, generateWorld } from './generation'

describe('block id table', () => {
  it('covers every block type exactly once and maps both ways', () => {
    expect(new Set(BLOCK_ID_LIST).size).toBe(BLOCK_ID_LIST.length)
    expect([...BLOCK_ID_LIST].sort()).toEqual(Object.keys(BLOCK_COLORS).sort())
    for (const block of BLOCK_ID_LIST) {
      expect(idToBlock(BLOCK_IDS[block])).toBe(block)
    }
    expect(BLOCK_IDS.air).toBe(0)
    expect(BLOCK_ID_LIST.length).toBeLessThanOrEqual(256)
  })
})

describe('cell accessors', () => {
  it('reads blocks by index and by position, with out-of-bounds as air', () => {
    const world = {
      width: 2,
      height: 2,
      cells: cellsFromBlocks(['stone', 'dirt', 'air', 'iron']),
    }
    expect(blockAt(world, 1)).toBe('dirt')
    expect(getBlock(world, 1, 1)).toBe('iron')
    expect(getBlock(world, -1, 0)).toBe('air')
    expect(getBlock(world, 0, 2)).toBe('air')
  })

  it('round-trips encoded cells', () => {
    const cells = cellsFromBlocks(['stone', 'dirt', 'air', 'relic'])
    expect(decodeCells(encodeCells(cells), 4)).toEqual(cells)
  })
})

describe('clearCell', () => {
  it('copies on write and issues a new topology key', () => {
    const world = generateWorld('clear-cell', 1)
    const index = world.start.y * world.width + world.start.x + 3
    expect(blockAt(world, index)).toBe('stone')

    const next = clearCell(world, { x: world.start.x + 3, y: world.start.y })

    expect(blockAt(world, index)).toBe('stone')
    expect(blockAt(next, index)).toBe('air')
    expect(next.cells).not.toBe(world.cells)
    expect(next.topologyKey).not.toBe(world.topologyKey)
  })
})

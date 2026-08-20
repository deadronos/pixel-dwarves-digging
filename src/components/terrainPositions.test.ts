import { describe, expect, it } from 'vitest'
import {
  createTerrainPositions,
  updateTerrainPositions,
} from './terrainPositions'
import type { Cell } from '../game/types'

const air = (): Cell => ({ block: 'air', biome: 'meadow' })
const stone = (): Cell => ({ block: 'stone', biome: 'meadow' })

describe('terrain position derivation', () => {
  it('derives positions for rendered block types', () => {
    const cells = [air(), stone(), air(), stone()]

    const positions = createTerrainPositions(cells, 2)

    expect(positions.get('stone')).toEqual([
      [1, 0],
      [1, 1],
    ])
  })

  it('retains all position arrays when cells are unchanged', () => {
    const cells = [air(), stone(), air(), stone()]
    const previous = createTerrainPositions(cells, 2)

    const next = updateTerrainPositions(previous, cells, cells, 2)

    expect(next).toBe(previous)
  })

  it('updates only block lists affected by changed cells', () => {
    const cells = [air(), stone(), air(), stone()]
    const previous = createTerrainPositions(cells, 2)
    const nextCells = cells.slice()
    nextCells[1] = air()
    nextCells[2] = stone()

    const next = updateTerrainPositions(previous, cells, nextCells, 2)

    expect(next.get('stone')).not.toBe(previous.get('stone'))
    expect(next.get('bedrock')).toBe(previous.get('bedrock'))
    expect(next.get('stone')).toEqual([
      [0, 1],
      [1, 1],
    ])
  })
})

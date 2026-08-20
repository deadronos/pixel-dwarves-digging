import { MINEABLE_BLOCKS } from '../game/content'
import type { BlockType, Cell } from '../game/types'

export type RenderedBlockType = Exclude<BlockType, 'air'>
export type TerrainPosition = [x: number, y: number]
export type TerrainPositions = Map<RenderedBlockType, TerrainPosition[]>

export const RENDERED_BLOCKS: readonly RenderedBlockType[] = [
  ...MINEABLE_BLOCKS,
  'bedrock',
]

function emptyPositions(): TerrainPositions {
  return new Map(RENDERED_BLOCKS.map((block) => [block, []]))
}

export function createTerrainPositions(
  cells: Cell[],
  width: number,
): TerrainPositions {
  const positions = emptyPositions()
  cells.forEach((cell, index) => {
    if (cell.block === 'air') return
    positions.get(cell.block)?.push([index % width, Math.floor(index / width)])
  })
  return positions
}

export function updateTerrainPositions(
  previous: TerrainPositions,
  previousCells: Cell[],
  nextCells: Cell[],
  width: number,
): TerrainPositions {
  if (previousCells.length !== nextCells.length) {
    return createTerrainPositions(nextCells, width)
  }

  const changedIndexes: number[] = []
  const touchedBlocks = new Set<RenderedBlockType>()
  nextCells.forEach((cell, index) => {
    if (cell === previousCells[index]) return
    changedIndexes.push(index)
    if (previousCells[index].block !== 'air') {
      touchedBlocks.add(previousCells[index].block)
    }
    if (cell.block !== 'air') touchedBlocks.add(cell.block)
  })

  if (changedIndexes.length === 0) return previous

  const changed = new Set(changedIndexes)
  const next = new Map(previous)
  for (const block of touchedBlocks) {
    const positions = (previous.get(block) ?? []).filter(
      ([x, y]) => !changed.has(y * width + x),
    )
    for (const index of changedIndexes) {
      if (nextCells[index].block !== block) continue
      positions.push([index % width, Math.floor(index / width)])
    }
    positions.sort(
      (first, second) =>
        first[1] * width + first[0] - (second[1] * width + second[0]),
    )
    next.set(block, positions)
  }
  return next
}

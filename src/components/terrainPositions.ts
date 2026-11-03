import { BLOCK_ID_LIST } from '../game/blocks'
import { MINEABLE_BLOCKS } from '../game/content'
import type { BlockType } from '../game/types'

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
  cells: Uint8Array,
  width: number,
): TerrainPositions {
  const positions = emptyPositions()
  cells.forEach((id, index) => {
    const block = BLOCK_ID_LIST[id]
    if (block === 'air') return
    positions.get(block)?.push([index % width, Math.floor(index / width)])
  })
  return positions
}

export function updateTerrainPositions(
  previous: TerrainPositions,
  previousCells: Uint8Array,
  nextCells: Uint8Array,
  width: number,
): TerrainPositions {
  if (previousCells.length !== nextCells.length) {
    return createTerrainPositions(nextCells, width)
  }

  const changedIndexes: number[] = []
  const touchedBlocks = new Set<RenderedBlockType>()
  nextCells.forEach((id, index) => {
    if (id === previousCells[index]) return
    changedIndexes.push(index)
    const previousBlock = BLOCK_ID_LIST[previousCells[index]]
    const block = BLOCK_ID_LIST[id]
    if (previousBlock !== 'air') touchedBlocks.add(previousBlock)
    if (block !== 'air') touchedBlocks.add(block)
  })

  if (changedIndexes.length === 0) return previous

  const changed = new Set(changedIndexes)
  const next = new Map(previous)
  for (const block of touchedBlocks) {
    const positions = (previous.get(block) ?? []).filter(
      ([x, y]) => !changed.has(y * width + x),
    )
    for (const index of changedIndexes) {
      if (BLOCK_ID_LIST[nextCells[index]] !== block) continue
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

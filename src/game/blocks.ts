import type { BlockType, World } from './types'

/**
 * Stable numeric ids for every block type. The index in this list is the byte
 * stored in `world.cells` and in saves, so NEVER reorder or remove entries;
 * only append new block types at the end (and bump the save version if the
 * meaning of an existing id would change).
 */
export const BLOCK_ID_LIST: readonly BlockType[] = [
  'air',
  'bedrock',
  'grass',
  'dirt',
  'sand',
  'sandstone',
  'red-stone',
  'snow',
  'packed-soil',
  'ice',
  'mushroom',
  'loam',
  'clay',
  'stone',
  'coal',
  'iron',
  'crystal',
  'relic',
]

export const AIR_ID = 0

export const BLOCK_IDS: Readonly<Record<BlockType, number>> = Object.freeze(
  Object.fromEntries(BLOCK_ID_LIST.map((block, id) => [block, id])) as Record<
    BlockType,
    number
  >,
)

export function blockToId(block: BlockType): number {
  return BLOCK_IDS[block]
}

/** Returns the block for an id, or undefined when the id is unknown. */
export function idToBlock(id: number): BlockType | undefined {
  return BLOCK_ID_LIST[id]
}

export function isBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < BLOCK_ID_LIST.length
}

/** Block at a flat cell index. The index must be in range. */
export function blockAt(world: Pick<World, 'cells'>, index: number): BlockType {
  return BLOCK_ID_LIST[world.cells[index]]
}

/** Block at (x, y); anything outside the world reads as air. */
export function getBlock(
  world: Pick<World, 'cells' | 'width' | 'height'>,
  x: number,
  y: number,
): BlockType {
  if (x < 0 || x >= world.width || y < 0 || y >= world.height) return 'air'
  return BLOCK_ID_LIST[world.cells[y * world.width + x]]
}

export function cellsFromBlocks(blocks: readonly BlockType[]): Uint8Array {
  const cells = new Uint8Array(blocks.length)
  for (let index = 0; index < blocks.length; index += 1) {
    cells[index] = BLOCK_IDS[blocks[index]]
  }
  return cells
}

export class CellDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CellDataError'
  }
}

/** Encodes cells as base64 of the raw bytes (one byte per cell). */
export function encodeCells(cells: Uint8Array): string {
  let binary = ''
  const chunk = 0x2000
  for (let offset = 0; offset < cells.length; offset += chunk) {
    binary += String.fromCharCode(...cells.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

/**
 * Decodes and validates base64 cell data. Throws `CellDataError` when the
 * payload is not base64, has the wrong length, or contains unknown block ids.
 */
export function decodeCells(
  encoded: unknown,
  expectedLength: number,
): Uint8Array {
  if (typeof encoded !== 'string') {
    throw new CellDataError('Save terrain data must be a base64 string.')
  }
  let binary: string
  try {
    binary = atob(encoded)
  } catch {
    throw new CellDataError('Save terrain data is not valid base64.')
  }
  if (binary.length !== expectedLength) {
    throw new CellDataError(
      `Save terrain data has ${binary.length} cells, expected ${expectedLength}.`,
    )
  }
  const cells = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    const id = binary.charCodeAt(index)
    if (!isBlockId(id)) {
      throw new CellDataError(
        `Save terrain data has unknown block id ${id} at cell ${index}.`,
      )
    }
    cells[index] = id
  }
  return cells
}

/**
 * Converts the pre-v5 `{ block, biome }[]` cell array into bytes. Throws
 * `CellDataError` for malformed entries or a wrong length.
 */
export function cellsFromLegacyArray(
  legacy: unknown,
  expectedLength: number,
): Uint8Array {
  if (!Array.isArray(legacy) || legacy.length !== expectedLength) {
    throw new CellDataError(
      `Save terrain data has the wrong number of cells, expected ${expectedLength}.`,
    )
  }
  const cells = new Uint8Array(expectedLength)
  for (let index = 0; index < expectedLength; index += 1) {
    const cell: unknown = legacy[index]
    const block =
      typeof cell === 'object' && cell !== null
        ? (cell as { block?: unknown }).block
        : undefined
    const id =
      typeof block === 'string' && Object.hasOwn(BLOCK_IDS, block)
        ? BLOCK_IDS[block as BlockType]
        : undefined
    if (id === undefined) {
      throw new CellDataError(
        `Save terrain data has an invalid cell at ${index}.`,
      )
    }
    cells[index] = id
  }
  return cells
}

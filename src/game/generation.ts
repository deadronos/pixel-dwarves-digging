import {
  BEDROCK_DEPTH,
  BIOME_DEFINITIONS,
  BIOME_IDS,
  BUILDING_DEFINITIONS,
  MINEABLE_BLOCKS,
  MINERAL_BLOCKS,
} from './content'
import { createRng, hashSeed, randomBetween, randomInt } from './rng'
import {
  type BiomeId,
  type BlockType,
  type Cell,
  indexFor,
  MAP_HEIGHT,
  MAP_WIDTH,
  type Position,
  type World,
} from './types'

const OUT_OF_BOUNDS_CELL: Cell = { block: 'air', biome: 'meadow' }

export function isSolid(block: BlockType): boolean {
  return block !== 'air'
}

export function getCell(world: World, x: number, y: number): Cell {
  if (x < 0 || x >= world.width || y < 0 || y >= world.height) {
    return OUT_OF_BOUNDS_CELL
  }

  return world.cells[indexFor(x, y, world.width)]
}

function biomeAt(x: number): BiomeId {
  const band = Math.min(
    BIOME_IDS.length - 1,
    Math.floor((x / MAP_WIDTH) * BIOME_IDS.length),
  )
  return BIOME_IDS[band]
}

function surfaceHeight(random: () => number, x: number): number {
  const wave = Math.sin(x / 13) * 2.4 + Math.sin(x / 31) * 2.1
  return Math.max(
    42,
    Math.min(62, Math.round(53 + wave + randomBetween(random, -1.5, 1.5))),
  )
}

function blockForDepth(
  random: () => number,
  biome: BiomeId,
  depth: number,
  x: number,
  y: number,
): BlockType {
  const definition = BIOME_DEFINITIONS[biome]

  if (depth === 0) return definition.surface
  if (depth <= 4) return definition.topsoil
  if (depth <= 9) return definition.subsoil

  const mineralRoll = random()
  if (mineralRoll < 0.018 && y < 58) return 'relic'
  if (mineralRoll < 0.07) return 'crystal'
  if (mineralRoll < 0.16) return 'iron'
  if (mineralRoll < 0.26) return 'coal'
  if ((x + y) % 17 === 0 && depth > 22) return 'iron'

  return definition.deep
}

function carveStarterPocket(
  cells: Cell[],
  surfaceHeights: number[],
  biomes: BiomeId[],
  start: Position,
  stockpile: Position,
): void {
  const set = (x: number, y: number, block: BlockType) => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return
    cells[indexFor(x, y, MAP_WIDTH)] = { block, biome: biomes[x] }
  }

  for (let x = start.x - 2; x <= start.x + 2; x += 1) {
    for (let y = start.y; y <= start.y + 1; y += 1) {
      set(x, y, 'air')
    }
  }

  const starterBlock: BlockType = biomes[start.x] === 'desert' ? 'sand' : 'dirt'
  set(start.x, surfaceHeights[start.x], starterBlock)
  set(start.x + 1, surfaceHeights[start.x + 1], starterBlock)
  set(stockpile.x, stockpile.y, 'air')
}

export function generateWorld(seed: string, runNumber: number): World {
  const random = createRng(hashSeed(seed, runNumber))
  const surfaceHeights = Array.from({ length: MAP_WIDTH }, (_, x) =>
    surfaceHeight(random, x),
  )
  const biomes = Array.from({ length: MAP_WIDTH }, (_, x) => biomeAt(x))
  const cells: Cell[] = Array.from(
    { length: MAP_WIDTH * MAP_HEIGHT },
    (_, index) => {
      const x = index % MAP_WIDTH
      const y = Math.floor(index / MAP_WIDTH)
      const surface = surfaceHeights[x]
      const biome = biomes[x]
      const block =
        y < BEDROCK_DEPTH
          ? 'bedrock'
          : y <= surface
            ? blockForDepth(random, biome, surface - y, x, y)
            : 'air'
      return { block, biome }
    },
  )

  const startX = 12
  const startY = surfaceHeights[startX] + 1
  const start = { x: startX, y: Math.min(MAP_HEIGHT - 3, startY) }
  const stockpile = { x: startX - 1, y: start.y }
  carveStarterPocket(cells, surfaceHeights, biomes, start, stockpile)

  if (!cells.some((cell) => MINERAL_BLOCKS.has(cell.block))) {
    const fallbackX = Math.floor(MAP_WIDTH * 0.6)
    const fallback = indexFor(fallbackX, 26, MAP_WIDTH)
    cells[fallback] = { block: 'iron', biome: biomes[fallbackX] }
  }

  const stockpileDefinition = BUILDING_DEFINITIONS.stockpile
  const stockpileBuilding = {
    id: 'stockpile-1',
    type: 'stockpile' as const,
    position: stockpile,
    width: stockpileDefinition.width,
    height: stockpileDefinition.height,
    level: 1,
    construction: 'completed' as const,
    storage: {
      capacity: stockpileDefinition.capacity,
      inventory: {},
    },
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells,
    seed,
    runNumber,
    surfaceHeights,
    biomes,
    start,
    stockpile,
    buildings: [stockpileBuilding],
  }
}

export function countSolids(world: World): number {
  return world.cells.reduce(
    (total, cell) =>
      total + (MINEABLE_BLOCKS.some((block) => block === cell.block) ? 1 : 0),
    0,
  )
}

export function countMinerals(world: World): number {
  return world.cells.reduce(
    (total, cell) => total + (MINERAL_BLOCKS.has(cell.block) ? 1 : 0),
    0,
  )
}

export function randomStarterSeed(): string {
  return `cavern-${randomInt(Math.random, 1000, 9999)}`
}

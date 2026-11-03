import { AIR_ID, BLOCK_ID_LIST, BLOCK_IDS } from './blocks'
import {
  BEDROCK_DEPTH,
  BIOME_DEFINITIONS,
  BIOME_IDS,
  BUILDING_DEFINITIONS,
  MINEABLE_BLOCK_SET,
  MINERAL_BLOCKS,
  STARTER_STONE_SUPPLY,
  STARTER_STONE_VEIN_LENGTH,
} from './content'
import { createTopologyKey } from './pathfinding'
import { createRng, hashSeed, randomBetween, randomInt } from './rng'
import {
  type BiomeId,
  type BlockType,
  indexFor,
  MAP_HEIGHT,
  MAP_WIDTH,
  type Position,
  type World,
} from './types'

export function isSolid(block: BlockType): boolean {
  return block !== 'air'
}

export function clearCell(world: World, target: Position): World {
  const targetIndex = indexFor(target.x, target.y, world.width)
  const cells = world.cells.slice()
  cells[targetIndex] = AIR_ID
  return {
    ...world,
    cells,
    topologyKey: createTopologyKey(),
  }
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
  prospecting: number,
): BlockType {
  const definition = BIOME_DEFINITIONS[biome]

  if (depth === 0) return definition.surface
  if (depth <= 4) return definition.topsoil
  if (depth <= 9) return definition.subsoil

  const mineralRoll = random()
  const prospectingBonus = Math.min(0.2, prospecting * 0.015)
  if (mineralRoll < 0.018 + prospectingBonus && y < 58) return 'relic'
  if (mineralRoll < 0.07 + prospectingBonus) return 'crystal'
  if (mineralRoll < 0.16 + prospectingBonus) return 'iron'
  if (mineralRoll < 0.26 + prospectingBonus) return 'coal'
  if ((x + y) % 17 === 0 && depth > 22) return 'iron'

  return definition.deep
}

function carveStarterPocket(
  cells: Uint8Array,
  _surfaceHeights: number[],
  biomes: BiomeId[],
  start: Position,
  stockpile: Position,
): void {
  const set = (x: number, y: number, block: BlockType) => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return
    cells[indexFor(x, y, MAP_WIDTH)] = BLOCK_IDS[block]
  }
  const starterBlock: BlockType = biomes[start.x] === 'desert' ? 'sand' : 'dirt'

  for (let x = start.x - 2; x <= start.x + 2; x += 1) {
    set(x, start.y - 1, starterBlock)
    for (let y = start.y; y <= start.y + 1; y += 1) {
      set(x, y, 'air')
    }
  }

  set(stockpile.x, start.y - 1, 'air')
  set(stockpile.x, stockpile.y, 'air')
}

export function generateWorld(
  seed: string,
  runNumber: number,
  prospecting = 0,
): World {
  const random = createRng(hashSeed(seed, runNumber))
  const surfaceHeights = Array.from({ length: MAP_WIDTH }, (_, x) =>
    surfaceHeight(random, x),
  )
  const biomes = Array.from({ length: MAP_WIDTH }, (_, x) => biomeAt(x))
  const cells = new Uint8Array(MAP_WIDTH * MAP_HEIGHT)
  for (let index = 0; index < cells.length; index += 1) {
    const x = index % MAP_WIDTH
    const y = Math.floor(index / MAP_WIDTH)
    const surface = surfaceHeights[x]
    const block: BlockType =
      y < BEDROCK_DEPTH
        ? 'bedrock'
        : y <= surface
          ? blockForDepth(random, biomes[x], surface - y, x, y, prospecting)
          : 'air'
    cells[index] = BLOCK_IDS[block]
  }

  const startX = 12
  const startY = surfaceHeights[startX] + 1
  const start = { x: startX, y: Math.min(MAP_HEIGHT - 3, startY) }
  const stockpile = { x: startX - 1, y: start.y }
  carveStarterPocket(cells, surfaceHeights, biomes, start, stockpile)

  for (let offset = 0; offset < STARTER_STONE_VEIN_LENGTH; offset += 1) {
    const x = start.x + 3 + offset
    if (x < MAP_WIDTH && start.y > BEDROCK_DEPTH) {
      cells[indexFor(x, start.y, MAP_WIDTH)] = BLOCK_IDS.stone
    }
  }

  if (!cells.some((id) => MINERAL_BLOCKS.has(BLOCK_ID_LIST[id]))) {
    const fallbackX = Math.floor(MAP_WIDTH * 0.6)
    const fallback = indexFor(fallbackX, 26, MAP_WIDTH)
    cells[fallback] = BLOCK_IDS.iron
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
      inventory: { stone: STARTER_STONE_SUPPLY },
    },
  }
  const starterLadder = {
    id: 'starter-ladder',
    type: 'ladder' as const,
    position: { x: stockpile.x, y: start.y - 1 },
    width: BUILDING_DEFINITIONS.ladder.width,
    height: BUILDING_DEFINITIONS.ladder.height,
    level: 1,
    construction: 'completed' as const,
  }
  const starterBridges = Array.from({ length: 3 }, (_, offset) => ({
    id: `starter-bridge-${offset + 1}`,
    type: 'bridge' as const,
    position: { x: start.x + offset, y: start.y - 1 },
    width: BUILDING_DEFINITIONS.bridge.width,
    height: BUILDING_DEFINITIONS.bridge.height,
    level: 1,
    construction: 'completed' as const,
  }))

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
    buildings: [stockpileBuilding, starterLadder, ...starterBridges],
    topologyKey: createTopologyKey(),
  }
}

/** 256-entry lookup tables indexed by block id (cheaper than a Set per cell). */
function buildBlockLut(blocks: ReadonlySet<BlockType>): Uint8Array {
  const lut = new Uint8Array(256)
  BLOCK_ID_LIST.forEach((block, id) => {
    if (blocks.has(block)) lut[id] = 1
  })
  return lut
}

const MINEABLE_LUT = buildBlockLut(MINEABLE_BLOCK_SET)
const MINERAL_LUT = buildBlockLut(MINERAL_BLOCKS)

function countByLut(cells: Uint8Array, lut: Uint8Array): number {
  let total = 0
  for (let i = 0; i < cells.length; i += 1) total += lut[cells[i]]
  return total
}

/**
 * Cells are copy-on-write (see `clearCell`), so a new array identity means
 * the contents changed. Cache the counts per array to avoid a full-grid scan
 * on every HUD/inspector/engine read.
 */
const solidsCache = new WeakMap<Uint8Array, number>()
const mineralsCache = new WeakMap<Uint8Array, number>()

export function countSolids(world: Pick<World, 'cells'>): number {
  let total = solidsCache.get(world.cells)
  if (total === undefined) {
    total = countByLut(world.cells, MINEABLE_LUT)
    solidsCache.set(world.cells, total)
  }
  return total
}

export function hasMineableSolids(world: Pick<World, 'cells'>): boolean {
  return countSolids(world) > 0
}

export function countMinerals(world: Pick<World, 'cells'>): number {
  let total = mineralsCache.get(world.cells)
  if (total === undefined) {
    total = countByLut(world.cells, MINERAL_LUT)
    mineralsCache.set(world.cells, total)
  }
  return total
}

export function randomStarterSeed(): string {
  return `cavern-${randomInt(Math.random, 1000, 9999)}`
}

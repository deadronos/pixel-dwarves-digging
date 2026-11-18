import type {
  BiomeId,
  BlockType,
  BuildingType,
  CommonBuildingMaterial,
  Inventory,
  MineableBlockType,
} from './types'

export const BUILDING_DEFINITIONS = {
  stockpile: { width: 3, height: 2, capacity: 120 },
  outpost: { width: 2, height: 2, capacity: 48, stone: 12 },
  depot: { width: 1, height: 1, capacity: 24, stone: 4 },
  bridge: { width: 1, height: 1, stone: 2 },
  ladder: { width: 1, height: 1, stone: 1 },
} as const

/**
 * Dwarves a fresh colony starts with. Pacing is dominated by travel, so hands
 * on the frontier matter more than a single dwarf working faster.
 */
export const STARTER_DWARVES = 6

/** Cells a dwarf crosses per tick before move-speed upgrades. */
export const BASE_MOVEMENT_STEPS = 2

/**
 * Blocks a dwarf carries per haul trip. Bigger satchels add one per level:
 * travel is the dominant cost, so fewer trips matters more than haul speed.
 */
export const BASE_CARRY_CAPACITY = 3

export const BEDROCK_DEPTH = 1
export const STARTER_BOOTSTRAP_CLEAR_COUNT = 4
export const STARTER_PROTECTED_RADIUS = 2
export const STARTER_STONE_VEIN_LENGTH = 3
export const STARTER_STONE_SUPPLY = 2
export const STARTER_EMERGENCY_STONE = 1
export const MAX_OPEN_ACCESS_REQUESTS = 3
export const STORAGE_UPGRADE_TRIGGER_CAPACITY = 12
// Give builders one depot's worth of extra headroom for incoming hauls.
export const OVERFLOW_DEPOT_TRIGGER_CAPACITY =
  STORAGE_UPGRADE_TRIGGER_CAPACITY + BUILDING_DEFINITIONS.depot.capacity
export const MAX_DEPOTS_PER_STOCKPILE = 8
export const STORAGE_UPGRADE_COST = 8
export const STORAGE_UPGRADE_CAPACITY_BONUS = 24
export const MAX_STORAGE_LEVEL = 3
export const NO_PROGRESS_TICK_LIMIT = 20
export const BOOTSTRAP_NO_PROGRESS_TICK_LIMIT = 3

export const BIOME_IDS: readonly BiomeId[] = [
  'meadow',
  'desert',
  'red-rock',
  'frozen',
  'mushroom',
]

export const MINERAL_BLOCKS = new Set<BlockType>([
  'coal',
  'iron',
  'crystal',
  'relic',
])

export const MINEABLE_BLOCKS: readonly MineableBlockType[] = [
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

export const MINEABLE_BLOCK_SET = new Set<BlockType>(MINEABLE_BLOCKS)

export const COMMON_BUILDING_MATERIALS: readonly CommonBuildingMaterial[] =
  MINEABLE_BLOCKS.filter(
    (block): block is CommonBuildingMaterial => !MINERAL_BLOCKS.has(block),
  )

export function getEmergencyReserveMaterial(
  inventory: Partial<Inventory>,
): CommonBuildingMaterial | null {
  return (
    COMMON_BUILDING_MATERIALS.find(
      (material) => (inventory[material] ?? 0) > 0,
    ) ?? null
  )
}

export type BiomeDefinition = {
  label: string
  surface: BlockType
  topsoil: BlockType
  subsoil: BlockType
  deep: BlockType
  accent: string
}

export const BIOME_DEFINITIONS: Record<BiomeId, BiomeDefinition> = {
  meadow: {
    label: 'Meadow',
    surface: 'grass',
    topsoil: 'dirt',
    subsoil: 'stone',
    deep: 'stone',
    accent: '#88a477',
  },
  desert: {
    label: 'Desert',
    surface: 'sand',
    topsoil: 'sand',
    subsoil: 'sandstone',
    deep: 'stone',
    accent: '#d0a461',
  },
  'red-rock': {
    label: 'Red-rock',
    surface: 'red-stone',
    topsoil: 'red-stone',
    subsoil: 'stone',
    deep: 'stone',
    accent: '#ad6652',
  },
  frozen: {
    label: 'Frozen',
    surface: 'snow',
    topsoil: 'packed-soil',
    subsoil: 'ice',
    deep: 'stone',
    accent: '#8eafc0',
  },
  mushroom: {
    label: 'Mushroom',
    surface: 'mushroom',
    topsoil: 'loam',
    subsoil: 'clay',
    deep: 'stone',
    accent: '#bd7893',
  },
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  air: 'Air',
  bedrock: 'Bedrock',
  grass: 'Grass',
  dirt: 'Dirt',
  sand: 'Sand',
  sandstone: 'Sandstone',
  'red-stone': 'Red stone',
  snow: 'Snow',
  'packed-soil': 'Packed soil',
  ice: 'Ice',
  mushroom: 'Mushroom cap',
  loam: 'Loam',
  clay: 'Clay',
  stone: 'Stone',
  coal: 'Coal',
  iron: 'Iron',
  crystal: 'Crystal',
  relic: 'Relic',
}

/**
 * Terrain palette. These are the literal on-screen colours: the canvas
 * renders without tone mapping, so a block appears exactly as written here
 * (and the HUD swatches match the map). `palette.test.ts` enforces that every
 * pair stays perceptually distinct — re-tune in OKLab, not by eye.
 *
 * Minerals sit away from the soils on lightness *and* chroma, so ore reads at
 * a glance instead of by hue alone: coal is a dark saturated slate, iron a
 * rust orange, crystal a saturated teal and relic a saturated gold.
 */
export const BLOCK_COLORS: Record<BlockType, string> = {
  air: '#20251f',
  bedrock: '#0b0f11',
  grass: '#71a66e',
  dirt: '#8d6841',
  sand: '#cfac64',
  sandstone: '#a1896c',
  'red-stone': '#98352c',
  snow: '#eef4fb',
  'packed-soil': '#657d94',
  ice: '#6cc7dc',
  mushroom: '#bd6f9b',
  loam: '#684258',
  clay: '#dcb1b2',
  stone: '#606863',
  coal: '#383955',
  iron: '#bf623d',
  crystal: '#1ed4ae',
  relic: '#eec94d',
}

/**
 * Building colours. Kept out of `BLOCK_COLORS` on purpose: a building must
 * never reuse a block colour, and the palette test checks that the two sets
 * stay apart.
 */
export const BUILDING_COLORS: Record<BuildingType, string> = {
  stockpile: '#e4d9b4',
  outpost: '#4d6eba',
  depot: '#9dc664',
  bridge: '#82a2c3',
  ladder: '#997fd3',
}

/**
 * Ticks a builder spends on site per unit of material it delivers. Builds
 * take visible time so a site reads as a scaffold being worked on rather than
 * appearing the instant a dwarf arrives.
 */
export const BUILD_TICKS_PER_MATERIAL = 6

export const DIG_DURATION: Record<BlockType, number> = {
  air: 0,
  bedrock: 0,
  grass: 2,
  dirt: 3,
  sand: 3,
  sandstone: 5,
  'red-stone': 6,
  snow: 2,
  'packed-soil': 4,
  ice: 4,
  mushroom: 3,
  loam: 3,
  clay: 4,
  stone: 7,
  coal: 8,
  iron: 11,
  crystal: 14,
  relic: 18,
}

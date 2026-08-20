import type {
  BiomeId,
  BlockType,
  CommonBuildingMaterial,
  Inventory,
  MineableBlockType,
} from './types'

export const BUILDING_DEFINITIONS = {
  stockpile: { width: 3, height: 2, capacity: 120 },
  outpost: { width: 2, height: 2, capacity: 48, stone: 12 },
  bridge: { width: 1, height: 1, stone: 2 },
  ladder: { width: 1, height: 1, stone: 1 },
} as const

export const BEDROCK_DEPTH = 1
export const STARTER_BOOTSTRAP_CLEAR_COUNT = 4
export const STARTER_PROTECTED_RADIUS = 2
export const STARTER_STONE_VEIN_LENGTH = 3
export const STARTER_STONE_SUPPLY = 2
export const STARTER_EMERGENCY_STONE = 1
export const MAX_OPEN_ACCESS_REQUESTS = 3

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

export const BLOCK_COLORS: Record<BlockType, string> = {
  air: '#20251f',
  bedrock: '#171b1a',
  grass: '#6f9464',
  dirt: '#87644c',
  sand: '#c8a36b',
  sandstone: '#a27b53',
  'red-stone': '#9b5545',
  snow: '#c8d6ce',
  'packed-soil': '#73818b',
  ice: '#7ca8b7',
  mushroom: '#a76c88',
  loam: '#725c61',
  clay: '#a16a62',
  stone: '#59615c',
  coal: '#2d3330',
  iron: '#a66c51',
  crystal: '#75b7ae',
  relic: '#dfbd62',
}

export const DIG_DURATION: Record<BlockType, number> = {
  air: 0,
  bedrock: 0,
  grass: 3,
  dirt: 5,
  sand: 4,
  sandstone: 8,
  'red-stone': 9,
  snow: 3,
  'packed-soil': 6,
  ice: 7,
  mushroom: 4,
  loam: 5,
  clay: 7,
  stone: 12,
  coal: 14,
  iron: 18,
  crystal: 24,
  relic: 30,
}

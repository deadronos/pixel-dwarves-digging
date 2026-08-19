export const MAP_WIDTH = 160
export const MAP_HEIGHT = 80

export type BlockType =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'sand'
  | 'sandstone'
  | 'red-stone'
  | 'snow'
  | 'packed-soil'
  | 'ice'
  | 'mushroom'
  | 'loam'
  | 'clay'
  | 'stone'
  | 'coal'
  | 'iron'
  | 'crystal'
  | 'relic'

export type MineableBlockType = Exclude<BlockType, 'air'>

export type BiomeId = 'meadow' | 'desert' | 'red-rock' | 'frozen' | 'mushroom'

export type Position = {
  x: number
  y: number
}

export type Cell = {
  block: BlockType
  biome: BiomeId
}

export type World = {
  width: number
  height: number
  cells: Cell[]
  seed: string
  runNumber: number
  surfaceHeights: number[]
  biomes: BiomeId[]
  start: Position
  stockpile: Position
}

export type Inventory = Record<MineableBlockType, number>

export type WorkPreference = 'nearest' | 'ore-first' | 'deepest-first'
export type HaulingPreference = 'nearest-stockpile' | 'finish-current-route'

export type MaterialPriority = Record<
  'coal' | 'iron' | 'crystal' | 'relic',
  boolean
>

export type PolicyState = {
  workPreference: WorkPreference
  haulingPreference: HaulingPreference
  materialPriority: MaterialPriority
}

export type TaskKind = 'idle' | 'dig' | 'haul'

export type TaskState = {
  kind: TaskKind
  target?: Position
  path: Position[]
  progress: number
  block?: MineableBlockType
}

export type DwarfState = {
  id: string
  position: Position
  task: TaskState
  carrying: MineableBlockType | null
}

export type SimulationState = {
  world: World
  dwarves: DwarfState[]
  inventory: Inventory
  policy: PolicyState
  tick: number
  totalCleared: number
  completed: boolean
  discoveredRelics: number
}

export const EMPTY_INVENTORY: Inventory = {
  grass: 0,
  dirt: 0,
  sand: 0,
  sandstone: 0,
  'red-stone': 0,
  snow: 0,
  'packed-soil': 0,
  ice: 0,
  mushroom: 0,
  loam: 0,
  clay: 0,
  stone: 0,
  coal: 0,
  iron: 0,
  crystal: 0,
  relic: 0,
}

export function indexFor(x: number, y: number, width = MAP_WIDTH): number {
  return y * width + x
}

export function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory }
}

export const MAP_WIDTH = 160
export const MAP_HEIGHT = 80

export type BlockType =
  | 'air'
  | 'bedrock'
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

export type MineableBlockType = Exclude<BlockType, 'air' | 'bedrock'>
export type CommonBuildingMaterial = Exclude<
  MineableBlockType,
  'coal' | 'iron' | 'crystal' | 'relic'
>

export type BiomeId = 'meadow' | 'desert' | 'red-rock' | 'frozen' | 'mushroom'

export type Position = {
  x: number
  y: number
}

export type BuildingType = 'stockpile' | 'outpost' | 'bridge' | 'ladder'
export type BuildingConstruction =
  | 'completed'
  | 'planned'
  | 'under-construction'
export type ConstructionPolicy = 'conserve' | 'balanced' | 'expand'
export type AccessFailure = 'support' | 'return-route' | 'storage-route'
export type AccessRequestStatus = 'open' | 'resolved' | 'blocked'
export type SafetyPhase = 'bootstrap' | 'operational' | 'blocked'
export type SafetyBlockReason =
  | 'waiting-for-stone'
  | 'waiting-for-material'
  | 'awaiting-recovery'
  | 'storage-full'
  | 'no-safe-work'

export type SafetyState = {
  phase: SafetyPhase
  emergencyStone: number
  blockedReason?: SafetyBlockReason
  /** Number of simulation ticks without movement, mining, delivery, or assignment progress. */
  noProgressTicks?: number
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
  /** @deprecated Use the primary stockpile building position. */
  stockpile: Position
  buildings: BuildingState[]
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

export type StorageState = {
  capacity: number
  inventory: Partial<Inventory>
}

export type BuildingState = {
  id: string
  type: BuildingType
  position: Position
  width: number
  height: number
  level: number
  construction: BuildingConstruction
  storage?: StorageState
}

export type ConstructionOrder = {
  id: string
  buildingId: string
  type: Exclude<BuildingType, 'stockpile'>
  required: Partial<Inventory>
  reserved: Partial<Inventory>
  delivered: Partial<Inventory>
  progress: number
  reason: 'access' | 'outpost' | 'capacity' | 'policy'
  accessRequestId?: string
}

export type AccessRequest = {
  id: string
  target: Position
  failure: AccessFailure
  priority: number
  approach?: Position
  worldRevision: number
  status: AccessRequestStatus
  blockedReason?:
    | 'waiting-for-stone'
    | 'waiting-for-material'
    | 'no-builder-route'
}

export type TaskKind = 'idle' | 'dig' | 'haul' | 'build'

export type TaskState = {
  kind: TaskKind
  target?: Position
  path: Position[]
  progress: number
  block?: MineableBlockType
  buildingId?: string
  constructionOrderId?: string
  purpose?: 'ordinary' | 'access' | 'recovery'
  accessRequestId?: string
  recoveryReason?: 'stranded' | 'storage-route'
}

export type DwarfState = {
  id: string
  position: Position
  movement: 'grounded' | 'falling' | 'stranded'
  task: TaskState
  carrying: MineableBlockType | null
}

export type SimulationState = {
  world: World
  dwarves: DwarfState[]
  inventory: Inventory
  policy: PolicyState
  constructionOrders: ConstructionOrder[]
  constructionPolicy: ConstructionPolicy
  accessRequests: AccessRequest[]
  worldRevision: number
  safety: SafetyState
  tick: number
  totalCleared: number
  completed: boolean
  discoveredRelics: number
  prestigeCurrency: number
  upgrades: UpgradeLevels
}

export type UpgradeLevels = {
  toolPower: number
  moveSpeed: number
  satchel: number
  extraBunks: number
  prospecting: number
}

export type PrestigeMode = 'full-clear' | 'relic'

export type SerializedSave = {
  schemaVersion: number
  state: SimulationState
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

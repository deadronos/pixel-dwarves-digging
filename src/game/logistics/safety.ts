import { getBlock } from '../blocks'
import { findPath, isSupported, simulateDigWorld } from '../pathfinding'
import type {
  AccessFailure,
  CommonBuildingMaterial,
  MineableBlockType,
  Position,
  SimulationState,
  World,
} from '../types'
import { findEmergencyLadderPlan } from './access'
import {
  chooseCommonConstructionMaterial,
  type StorageDestination,
  selectStorageDestination,
  storageBuildings,
} from './storage'

export type DigSafety = {
  safe: boolean
  failure?: AccessFailure
  storage?: StorageDestination
  dropDistance?: number
  landing?: Position
  recoveryWorld?: World
  recoveryMaterial?: CommonBuildingMaterial
  /** Where the return ladder must be anchored, when one is required. */
  ladderPosition?: Position
}

const digSafetyCache = new WeakMap<World, Map<string, DigSafety>>()

function digSafetyKey(
  state: SimulationState,
  stand: Position,
  target: Position,
): string {
  const reservations = state.dwarves
    .filter(
      (dwarf) =>
        dwarf.carrying !== null &&
        dwarf.task.kind === 'haul' &&
        dwarf.task.target !== undefined,
    )
    .map((dwarf) => {
      const targetKey = dwarf.task.target
        ? `${dwarf.task.target.x}:${dwarf.task.target.y}`
        : ''
      return `${dwarf.id}:${dwarf.task.buildingId ?? ''}:${targetKey}`
    })
    .sort()
    .join('|')
  return `${stand.x}:${stand.y}|${target.x}:${target.y}|${state.policy.haulingPreference}|${reservations}`
}

function assessSupportDropSafety(
  state: SimulationState,
  stand: Position,
  target: Position,
  block: MineableBlockType,
): DigSafety {
  if (target.x !== stand.x || target.y !== stand.y - 1) {
    return { safe: false, failure: 'support' }
  }

  const recoveryMaterial = chooseCommonConstructionMaterial(state, 1)
  const hasIdleHelper = state.dwarves.some(
    (dwarf) =>
      dwarf.task.kind === 'idle' &&
      !dwarf.carrying &&
      (dwarf.position.x !== stand.x || dwarf.position.y !== stand.y),
  )
  if (!hasIdleHelper && !recoveryMaterial) {
    return { safe: false, failure: 'support' }
  }

  const recoveryWorld = simulateDigWorld(state.world, target)
  const recoveryState = { ...state, world: recoveryWorld }
  for (const dropDistance of [1, 2]) {
    const landing = { x: stand.x, y: stand.y - dropDistance }
    if (getBlock(recoveryWorld, landing.x, landing.y) !== 'air') continue
    if (!isSupported(recoveryWorld, landing)) continue

    const storage = selectStorageDestination(recoveryState, block, landing)
    if (storage) {
      return {
        safe: true,
        storage,
        dropDistance,
        landing,
        recoveryWorld,
      }
    }

    if (recoveryMaterial) {
      const ladderPlan = findEmergencyLadderPlan(
        recoveryState,
        landing,
        block,
        recoveryMaterial,
      )
      if (ladderPlan) {
        return {
          safe: true,
          storage: ladderPlan.destination,
          dropDistance,
          landing,
          recoveryWorld: ladderPlan.world,
          recoveryMaterial: ladderPlan.material,
          ladderPosition: ladderPlan.position,
        }
      }
    }
  }

  return { safe: false, failure: 'support' }
}

function assessDigSafetyUncached(
  state: SimulationState,
  stand: Position,
  target: Position,
): DigSafety {
  const targetBlock = getBlock(state.world, target.x, target.y)
  if (targetBlock === 'air' || targetBlock === 'bedrock') {
    return { safe: false, failure: 'support' }
  }

  if (!isSupported(state.world, stand, target)) {
    return assessSupportDropSafety(state, stand, target, targetBlock)
  }

  const storage = selectStorageDestination(
    state,
    targetBlock,
    stand,
    undefined,
    target,
  )
  return storage
    ? { safe: true, storage }
    : { safe: false, failure: 'storage-route' }
}

function preservesCoworkerStorageRoutes(
  state: SimulationState,
  target: Position,
  minerId?: string,
): boolean {
  const above = { x: target.x, y: target.y + 1 }
  // The only existing walkable cell a dig can remove is the one above it.
  if (
    getBlock(state.world, above.x, above.y) !== 'air' ||
    isSupported(state.world, above, target)
  ) {
    return true
  }

  // Movement is symmetric, so each storage-origin search can serve every dwarf.
  const storage = storageBuildings(state.world)
  const hasStorageRoute = (to: Position, cleared?: Position) =>
    storage.some(
      ({ position }) => findPath(state.world, position, to, cleared) !== null,
    )

  // A planned return ladder takes time to anchor and can be interrupted.
  return state.dwarves.every(
    ({ id, position }) =>
      id === minerId ||
      hasStorageRoute(position, target) ||
      !hasStorageRoute(position),
  )
}

export function assessDigSafety(
  state: SimulationState,
  stand: Position,
  target: Position,
  minerId?: string,
): DigSafety {
  let worldCache = digSafetyCache.get(state.world)
  if (!worldCache) {
    worldCache = new Map()
    digSafetyCache.set(state.world, worldCache)
  }

  const key = digSafetyKey(state, stand, target)
  let result = worldCache.get(key)
  if (!result) {
    result = assessDigSafetyUncached(state, stand, target)
    worldCache.set(key, result)
  }
  // Dwarves can move while the world and the miner's route stay the same.
  if (result.safe && !preservesCoworkerStorageRoutes(state, target, minerId)) {
    return { safe: false, failure: 'support' }
  }
  return result
}

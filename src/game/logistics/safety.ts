import { simulateDigWorld, isSupported } from '../pathfinding'
import {
  type AccessFailure,
  type CommonBuildingMaterial,
  type MineableBlockType,
  type Position,
  type SimulationState,
  type World,
} from '../types'
import { findEmergencyLadderPlan } from './access'
import {
  chooseCommonConstructionMaterial,
  selectStorageDestination,
  type StorageDestination,
} from './storage'

export type DigSafety = {
  safe: boolean
  failure?: AccessFailure
  storage?: StorageDestination
  dropDistance?: number
  landing?: Position
  recoveryWorld?: World
  recoveryMaterial?: CommonBuildingMaterial
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
    const landingCell =
      recoveryWorld.cells[landing.y * recoveryWorld.width + landing.x]
    if (landingCell?.block !== 'air') continue
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
  const targetCell = state.world.cells[target.y * state.world.width + target.x]
  if (
    !targetCell ||
    targetCell.block === 'air' ||
    targetCell.block === 'bedrock'
  ) {
    return { safe: false, failure: 'support' }
  }

  if (!isSupported(state.world, stand, target)) {
    return assessSupportDropSafety(state, stand, target, targetCell.block)
  }

  const storage = selectStorageDestination(
    state,
    targetCell.block,
    stand,
    undefined,
    target,
  )
  return storage
    ? { safe: true, storage }
    : { safe: false, failure: 'storage-route' }
}

export function assessDigSafety(
  state: SimulationState,
  stand: Position,
  target: Position,
): DigSafety {
  let worldCache = digSafetyCache.get(state.world)
  if (!worldCache) {
    worldCache = new Map()
    digSafetyCache.set(state.world, worldCache)
  }

  const key = digSafetyKey(state, stand, target)
  const cached = worldCache.get(key)
  if (cached) return cached

  const result = assessDigSafetyUncached(state, stand, target)
  worldCache.set(key, result)
  return result
}

import { canPlaceBuilding, consumeConstructionMaterial } from '../buildings'
import { BUILD_TICKS_PER_MATERIAL, BUILDING_DEFINITIONS } from '../content'
import { selectStorageDestination } from '../logistics'
import { createTopologyKey, findPath } from '../pathfinding'
import type { DwarfState, SimulationState } from '../types'
import type { AdvanceResult } from './recovery'
import { idleTask, invalidateTask, unchanged } from './tasks'

/**
 * Anchoring the ladder that gets a dwarf back out of a pocket it just dug into.
 *
 * A straight-down dig lands the dwarf below its own route to storage, so the
 * safety pass plans a return ladder. That ladder used to appear the instant the
 * block was mined. Instead the dwarf now spends `BUILD_TICKS_PER_MATERIAL` ticks
 * anchoring it, then carries its cargo to storage as usual.
 *
 * The material is spent when the ladder is finished, not when the dig lands, so
 * an interrupted anchor costs nothing (the emergency rescue path can still
 * place a ladder for a genuinely stranded dwarf).
 */
export function advanceAnchorBuild(
  state: SimulationState,
  dwarf: DwarfState,
): AdvanceResult {
  const task = dwarf.task
  if (task.kind !== 'anchor' || !task.target || !task.block) {
    return unchanged({ ...dwarf, task: idleTask() }, state.world)
  }

  const position = task.target
  const nextProgress = task.progress + 1

  if (nextProgress < BUILD_TICKS_PER_MATERIAL) {
    return {
      dwarf: { ...dwarf, task: { ...task, progress: nextProgress } },
      world: state.world,
      minedBlock: null,
      progressed: true,
    }
  }

  const definition = BUILDING_DEFINITIONS.ladder
  if (!canPlaceBuilding(state.world, { type: 'ladder', position })) {
    return invalidateTask(state, dwarf)
  }

  const consumed = consumeConstructionMaterial(state, task.block, 1)
  if (!consumed) return invalidateTask(state, dwarf)

  const anchoredWorld = {
    ...consumed.world,
    buildings: [
      ...consumed.world.buildings,
      {
        id: `emergency-ladder-${position.x}-${position.y}-${state.worldRevision}`,
        type: 'ladder' as const,
        position,
        width: definition.width,
        height: definition.height,
        level: 1,
        construction: 'completed' as const,
      },
    ],
    topologyKey: createTopologyKey(),
  }
  const carrying = dwarf.carrying
  const storage = carrying
    ? selectStorageDestination(
        { ...consumed, world: anchoredWorld },
        carrying,
        dwarf.position,
      )
    : null
  const path = storage
    ? findPath(anchoredWorld, dwarf.position, storage.position)
    : null

  if (!carrying || !storage || !path) {
    return {
      dwarf: { ...dwarf, task: idleTask() },
      world: anchoredWorld,
      minedBlock: null,
      inventory: consumed.inventory,
      progressed: true,
    }
  }

  return {
    dwarf: {
      ...dwarf,
      task: {
        kind: 'haul',
        target: storage.position,
        path,
        progress: 0,
        block: carrying,
        buildingId: storage.id,
        purpose: 'ordinary',
      },
    },
    world: anchoredWorld,
    minedBlock: null,
    inventory: consumed.inventory,
    progressed: true,
  }
}

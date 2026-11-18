import { canPlaceBuilding, consumeConstructionMaterial } from '../buildings'
import { BUILDING_DEFINITIONS } from '../content'
import { queueAccessConstruction } from '../logistics/access'
import { assessDigSafety } from '../logistics/safety'
import {
  chooseCommonConstructionMaterial,
  getAvailableConstructionMaterial,
} from '../logistics/storage'
import {
  createTopologyKey,
  findReachableConstructionSites,
} from '../pathfinding'
import type { AccessRequest, SimulationState } from '../types'
import {
  createTargetPlanningContext,
  rankedWorkCandidates,
  taskKey,
} from './targeting'

const RECOVERY_SEARCH_INTERVAL = 10
const SITES_PER_SEARCH = 16

export function planFrontierRecovery(state: SimulationState): SimulationState {
  if (
    state.safety.blockedReason !== 'no-safe-work' ||
    state.tick % RECOVERY_SEARCH_INTERVAL !== 0 ||
    state.dwarves.some(
      (dwarf) =>
        dwarf.task.kind !== 'idle' ||
        dwarf.carrying !== null ||
        dwarf.movement !== 'grounded',
    )
  ) {
    return state
  }

  const ladderMaterial = chooseCommonConstructionMaterial(
    state,
    BUILDING_DEFINITIONS.ladder.stone,
  )
  const canAffordBridge =
    getAvailableConstructionMaterial(state, 'stone') >=
    BUILDING_DEFINITIONS.bridge.stone
  if (!ladderMaterial && !canAffordBridge) return state

  const sites = findReachableConstructionSites(
    state.world,
    state.dwarves.map(({ position }) => position),
  )
  if (sites.length === 0) return state

  // Rotate through bounded batches so a stalled tick never previews the whole map.
  const windowCount = Math.ceil(sites.length / SITES_PER_SEARCH)
  const window = (state.tick / RECOVERY_SEARCH_INTERVAL - 1) % windowCount
  const first = window * SITES_PER_SEARCH
  const linkedRequests = new Set(
    state.constructionOrders.map(({ accessRequestId }) => accessRequestId),
  )

  for (const position of sites.slice(first, first + SITES_PER_SEARCH)) {
    for (const type of ['ladder', 'bridge'] as const) {
      const material =
        type === 'ladder' ? ladderMaterial : canAffordBridge ? 'stone' : null
      if (!material || !canPlaceBuilding(state.world, { type, position }))
        continue
      const definition = BUILDING_DEFINITIONS[type]
      const paid = consumeConstructionMaterial(
        state,
        material,
        definition.stone,
      )
      if (!paid) continue
      const preview: SimulationState = {
        ...paid,
        world: {
          ...paid.world,
          topologyKey: createTopologyKey(),
          buildings: [
            ...paid.world.buildings,
            {
              id: `frontier-preview-${taskKey(position)}`,
              type,
              position,
              width: definition.width,
              height: definition.height,
              level: 1,
              construction: 'completed',
            },
          ],
        },
      }
      const context = createTargetPlanningContext(preview)
      for (const dwarf of preview.dwarves) {
        const work = rankedWorkCandidates(preview, dwarf, context).find(
          ({ target, stand }) =>
            !linkedRequests.has(`access-${taskKey(target)}`) &&
            assessDigSafety(preview, stand, target, dwarf.id).safe,
        )
        if (!work) continue
        const id = `access-${taskKey(work.target)}`
        const request: AccessRequest = {
          id,
          target: work.target,
          approach: work.stand,
          failure: 'support',
          // Keep the request through the usual access cap until the build is assigned.
          priority:
            1 +
            Math.max(
              0,
              ...state.accessRequests.map(({ priority }) => priority),
            ),
          worldRevision: state.worldRevision,
          status: 'open',
        }
        return queueAccessConstruction(
          state,
          request,
          { type, position },
          material,
        )
      }
    }
  }

  return state
}

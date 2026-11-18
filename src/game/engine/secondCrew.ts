import { getBlock } from '../blocks'
import { assessDigSafety, type DigSafety } from '../logistics/safety'
import { findPath } from '../pathfinding'
import type { DwarfState, Position, SimulationState } from '../types'
import type { TargetCandidate } from './targeting'

const FRONT_RADIUS = 4
const MAIN_CREW_SIZE = 2
const MAX_SCORE_LOSS = 8
const EXTRA_HAUL_CELLS = 4
const EXTRA_ROUND_TRIP_CELLS = 8

type DigRoute = Pick<TargetCandidate, 'target' | 'stand' | 'path'>

type CrewFront = {
  target: Position
  crew: Position[]
  otherAssignments: Position[]
  roundTrip: number
  haul: number
}

function near(first: Position, second: Position): boolean {
  return (
    Math.abs(first.x - second.x) + Math.abs(first.y - second.y) <= FRONT_RADIUS
  )
}

function assignedMiners(state: SimulationState, dwarf: DwarfState) {
  if (
    !state.secondCrew ||
    state.safety.phase !== 'operational' ||
    dwarf.carrying
  )
    return []

  return state.dwarves.flatMap((miner) => {
    const { task } = miner
    if (
      miner.id === dwarf.id ||
      miner.movement !== 'grounded' ||
      task.kind !== 'dig' ||
      (task.purpose !== undefined && task.purpose !== 'ordinary') ||
      !task.target ||
      getBlock(state.world, task.target.x, task.target.y) === 'air'
    )
      return []
    return [task.target]
  })
}

function haulDistance(
  state: SimulationState,
  route: DigRoute,
  safety: DigSafety,
): number | null {
  if (!safety.safe || !safety.storage) return null
  return (
    findPath(
      safety.recoveryWorld ?? state.world,
      safety.landing ?? route.stand,
      safety.storage.position,
      safety.recoveryWorld ? undefined : route.target,
    )?.length ?? null
  )
}

function staffedFront(
  state: SimulationState,
  miners: ReturnType<typeof assignedMiners>,
  route: DigRoute,
  safety: DigSafety,
): CrewFront | null {
  const crew = miners.filter((target) => near(target, route.target))
  if (crew.length < MAIN_CREW_SIZE) return null
  const haul = haulDistance(state, route, safety)
  if (haul === null) return null
  return {
    target: route.target,
    crew,
    otherAssignments: miners.filter((target) => !crew.includes(target)),
    roundTrip: route.path.length + haul,
    haul,
  }
}

function canWorkSecondFace(
  state: SimulationState,
  dwarf: DwarfState,
  front: CrewFront,
  route: DigRoute,
): boolean {
  if (
    near(route.target, front.target) ||
    front.crew.some((target) => near(route.target, target)) ||
    front.otherAssignments.some((target) => !near(route.target, target)) ||
    route.path.length > front.roundTrip + EXTRA_ROUND_TRIP_CELLS
  )
    return false

  const safety = assessDigSafety(state, route.stand, route.target, dwarf.id)
  // Splitting the crew should not spend emergency materials on a descent.
  if (safety.ladderPosition) return false
  const haul = haulDistance(state, route, safety)
  return (
    haul !== null &&
    haul <= front.haul + EXTRA_HAUL_CELLS &&
    route.path.length + haul <= front.roundTrip + EXTRA_ROUND_TRIP_CELLS
  )
}

export function chooseSecondCrewTarget(
  state: SimulationState,
  dwarf: DwarfState,
  primary: TargetCandidate,
  safety: DigSafety,
  ranked: TargetCandidate[],
  startIndex: number,
): TargetCandidate | null {
  const front = staffedFront(
    state,
    assignedMiners(state, dwarf),
    primary,
    safety,
  )
  if (!front) return null

  for (let index = startIndex; index < ranked.length; index += 1) {
    const candidate = ranked[index]
    if (primary.score - candidate.score > MAX_SCORE_LOSS) break
    if (canWorkSecondFace(state, dwarf, front, candidate)) return candidate
  }
  return null
}

import { registerHooks } from 'node:module'

const [policy, tickLimit, ...seeds] = process.argv.slice(2)
const ticks = Number(tickLimit)
const hauling = process.env.PACING_HAULING ?? 'nearest-stockpile'
if (
  !['balanced', 'expand', 'conserve'].includes(policy) ||
  !['nearest-stockpile', 'finish-current-route'].includes(hauling) ||
  !Number.isSafeInteger(ticks) ||
  ticks < 1 ||
  seeds.length === 0
) {
  throw new Error(
    'Usage: node tools/pacing-replay.mjs <balanced|expand|conserve> <ticks> <seed> [...]',
  )
}

// Use the game's TypeScript modules directly, including their extensionless imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (
        !specifier.startsWith('.') ||
        !['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(
          error.code,
        )
      ) {
        throw error
      }
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})

const [
  { stepSimulation },
  { createInitialSimulation },
  { countSolids },
  { assessDigSafety },
  { isFrontierDepot },
  { getStorageDiagnostics },
  { reachableTargets, rankedWorkCandidates },
] = await Promise.all(
  [
    'engine',
    'state',
    'generation',
    'logistics/safety',
    'logistics/storage',
    'logistics/expansion',
    'engine/targeting',
  ].map((module) => import(`../src/game/${module}.ts`)),
)

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1
}

function sampleIdle(state, counts) {
  // Give the observer a separate world identity so it cannot prime the
  // engine's dig-safety cache ahead of the next tick.
  const probe = { ...state, world: { ...state.world } }
  for (const dwarf of probe.dwarves) {
    if (
      dwarf.task.kind !== 'idle' ||
      dwarf.carrying ||
      dwarf.movement !== 'grounded'
    )
      continue
    const ranked = rankedWorkCandidates(probe, dwarf)
    if (ranked.length === 0) {
      increment(
        counts,
        reachableTargets(probe.world, dwarf.position).length === 0
          ? 'no-reachable-face'
          : 'claimed-or-bootstrap-protected',
      )
      continue
    }
    const reasons = new Set()
    for (const { stand, target } of ranked) {
      const result = assessDigSafety(probe, stand, target, dwarf.id)
      reasons.add(result.safe ? 'safe-target' : (result.failure ?? 'other'))
      if (result.safe) break
    }
    increment(
      counts,
      reasons.has('safe-target')
        ? 'safe-target'
        : reasons.has('support') && reasons.has('storage-route')
          ? 'mixed-unsafe'
          : [...reasons][0],
    )
  }
}

for (const seed of seeds) {
  let state = createInitialSimulation(seed)
  state = {
    ...state,
    constructionPolicy: policy,
    policy: { ...state.policy, haulingPreference: hauling },
  }
  const mineable = countSolids(state.world)
  const taskTicks = {}
  const blockedTicks = {}
  const idleSamples = {}
  const hauls = {}
  let longestNoDig = 0
  let longestBlocked = 0
  let blocked = 0
  let lastMiningTick = 0
  let firstRelicTick = null

  for (let tick = 1; tick <= ticks; tick += 1) {
    const next = stepSimulation(state)
    if (next.totalCleared > state.totalCleared) lastMiningTick = tick
    if (firstRelicTick === null && next.discoveredRelics > 0)
      firstRelicTick = tick
    longestNoDig = Math.max(longestNoDig, tick - lastMiningTick)
    if (next.safety.blockedReason) {
      increment(blockedTicks, next.safety.blockedReason)
      blocked += 1
      longestBlocked = Math.max(longestBlocked, blocked)
    } else {
      blocked = 0
    }

    for (const [index, dwarf] of next.dwarves.entries()) {
      const { task } = dwarf
      increment(taskTicks, task.path.length ? `${task.kind}-travel` : task.kind)
      const previous = state.dwarves[index].task
      if (
        task.kind === 'haul' &&
        task.target &&
        dwarf.carrying &&
        (previous.kind !== 'haul' || !previous.target)
      ) {
        const building = next.world.buildings.find(
          ({ id }) => id === task.buildingId,
        )
        const key =
          building && isFrontierDepot(building)
            ? 'frontier-depot'
            : (building?.type ?? 'other')
        hauls[key] ??= { trips: 0, blocks: 0, pathCells: 0 }
        const stats = hauls[key]
        stats.trips += 1
        stats.blocks += dwarf.carryingCount ?? 1
        stats.pathCells += task.path.length
      }
    }

    state = next
    if (tick % 50 === 0) sampleIdle(state, idleSamples)
    if (
      tick === 1_000 ||
      tick === 3_000 ||
      tick % 6_000 === 0 ||
      tick === ticks
    ) {
      const buildings = state.world.buildings.filter(
        ({ construction }) => construction === 'completed',
      )
      const storage = getStorageDiagnostics(state)
      console.log(
        JSON.stringify({
          seed,
          policy,
          hauling,
          tick,
          mineable,
          cleared: state.totalCleared,
          relics: state.discoveredRelics,
          firstRelicTick,
          lastMiningTick,
          longestNoDig,
          longestBlocked,
          blockedTicks,
          taskTicks,
          idleSamples,
          hauls,
          ladders: buildings.filter(({ type }) => type === 'ladder').length,
          depots: buildings.filter(({ type }) => type === 'depot').length,
          frontierDepots: buildings.filter(isFrontierDepot).length,
          storageCapacity: storage.totalCapacity,
          storageUsed: storage.occupiedCapacity,
          freeStorage: storage.stateAvailableCapacity,
          storageExpansion: storage.expansion,
          endBlocker: state.safety.blockedReason ?? null,
          openAccessRequests: state.accessRequests.filter(
            ({ status }) => status === 'open',
          ).length,
          pendingConstruction: state.constructionOrders.length,
          completed: state.completed,
        }),
      )
    }
  }
}

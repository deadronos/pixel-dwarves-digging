import { useMemo } from 'react'
import { getPrimaryStockpile } from '../game/buildings'
import { BIOME_DEFINITIONS, MINEABLE_BLOCK_SET } from '../game/content'
import { getStorageDiagnostics } from '../game/logistics'
import { canPrestige, UPGRADE_COSTS } from '../game/progression'
import { useGameStore } from '../game/state'
import type { UpgradeLevels } from '../game/types'

const UPGRADE_LABELS: Record<
  keyof UpgradeLevels,
  { label: string; detail: string }
> = {
  toolPower: { label: 'Stronger tools', detail: 'shorter dig cycles' },
  moveSpeed: { label: 'Lightweight gear', detail: 'faster travel' },
  satchel: { label: 'Bigger satchels', detail: 'more efficient hauling' },
  extraBunks: { label: 'Extra bunk', detail: 'one more starting dwarf' },
  prospecting: { label: 'Better prospecting', detail: 'sharper mineral odds' },
}

export default function Inspector() {
  const simulation = useGameStore((state) => state.simulation)
  const prestige = useGameStore((state) => state.prestige)
  const buyUpgrade = useGameStore((state) => state.buyUpgrade)
  const remaining = useMemo(
    () =>
      simulation.world.cells.filter((cell) =>
        MINEABLE_BLOCK_SET.has(cell.block),
      ).length,
    [simulation.world.cells],
  )
  const total = remaining + simulation.totalCleared
  const progress =
    total === 0 ? 100 : Math.round((simulation.totalCleared / total) * 100)
  const centerBiome =
    simulation.world.biomes[Math.floor(simulation.world.width / 2)]
  const biome = BIOME_DEFINITIONS[centerBiome]
  const stockpile = getPrimaryStockpile(simulation.world)
  const stockpileTotal = Object.values(
    stockpile?.storage?.inventory ?? {},
  ).reduce((total, amount) => total + amount, 0)
  const stockpileCapacity = stockpile?.storage?.capacity ?? 0
  const outpostCount = simulation.world.buildings.filter(
    (building) => building.type === 'outpost',
  ).length
  const depotCount = simulation.world.buildings.filter(
    (building) => building.type === 'depot',
  ).length
  const openAccessRequests = simulation.accessRequests.filter(
    (request) => request.status === 'open',
  ).length
  const recoveryCount = simulation.dwarves.filter(
    (dwarf) =>
      dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded',
  ).length
  const storageDiagnostics = useMemo(
    () => getStorageDiagnostics(simulation),
    [simulation],
  )

  return (
    <aside className="inspector">
      <div className="inspector-section progress-section">
        <div className="section-heading">
          <span className="section-kicker">EXCAVATION</span>
          <strong>{progress}%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p>
          {simulation.totalCleared.toLocaleString()} stored /{' '}
          {remaining.toLocaleString()} blocks remain
        </p>
      </div>

      <div className="inspector-section">
        <span className="section-kicker">COLONY</span>
        <dl className="stat-list">
          <div>
            <dt>dwarves</dt>
            <dd>{simulation.dwarves.length}</dd>
          </div>
          <div>
            <dt>on task</dt>
            <dd>
              {
                simulation.dwarves.filter((dwarf) => dwarf.task.kind !== 'idle')
                  .length
              }
            </dd>
          </div>
          <div>
            <dt>band</dt>
            <dd>{biome.label}</dd>
          </div>
          <div>
            <dt>relics found</dt>
            <dd>{simulation.discoveredRelics}</dd>
          </div>
          <div>
            <dt>main storage</dt>
            <dd>
              {stockpileTotal.toLocaleString()} /{' '}
              {stockpileCapacity.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>free capacity</dt>
            <dd>{storageDiagnostics.availableCapacity}</dd>
          </div>
          <div>
            <dt>outposts</dt>
            <dd>{outpostCount}</dd>
          </div>
          <div>
            <dt>depots</dt>
            <dd>{depotCount}</dd>
          </div>
          <div>
            <dt>building</dt>
            <dd>{simulation.constructionOrders.length}</dd>
          </div>
          <div>
            <dt>access requests</dt>
            <dd>{openAccessRequests}</dd>
          </div>
          <div>
            <dt>recovery</dt>
            <dd>{recoveryCount}</dd>
          </div>
          <div>
            <dt>world floor</dt>
            <dd>bedrock</dd>
          </div>
          <div>
            <dt>safety</dt>
            <dd>
              {simulation.safety.phase}
              {simulation.safety.blockedReason
                ? ` · ${simulation.safety.blockedReason.replaceAll('-', ' ')}`
                : ''}
            </dd>
          </div>
        </dl>
      </div>

      <div className="inspector-section">
        <span className="section-kicker">STORAGE LOGISTICS</span>
        <p className="directive">
          {storageDiagnostics.occupiedCapacity.toLocaleString()} /{' '}
          {storageDiagnostics.totalCapacity.toLocaleString()} occupied ·{' '}
          {storageDiagnostics.reservedCapacity} reserved
        </p>
        <ul className="muted-copy">
          {storageDiagnostics.expansion.map((candidate) => (
            <li key={candidate.kind}>
              {candidate.kind.replace('-', ' ')}:{' '}
              {candidate.reason.replaceAll('-', ' ')}
            </li>
          ))}
        </ul>
      </div>

      <div className="inspector-section">
        <span className="section-kicker">DIRECTIVE</span>
        <p className="directive">
          {simulation.policy.workPreference.replace('-', ' ')} ·{' '}
          {simulation.policy.haulingPreference.replace('-', ' ')} ·{' '}
          {simulation.constructionPolicy} construction
        </p>
        <p className="muted-copy">
          The colony selects reachable work from this policy. Terrain decides
          the cost.
        </p>
      </div>

      <div className="inspector-section prestige-section">
        <div className="section-heading">
          <span className="section-kicker">PRESTIGE</span>
          <strong className="currency">{simulation.prestigeCurrency} ◈</strong>
        </div>
        <p className="muted-copy">
          Clear the map for a full reward. A relic permits an earlier, smaller
          reset.
        </p>
        <div className="prestige-actions">
          <button
            type="button"
            className="action-button"
            disabled={!canPrestige(simulation, 'full-clear')}
            onClick={() => prestige('full-clear')}
          >
            full clear
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!canPrestige(simulation, 'relic')}
            onClick={() => prestige('relic')}
          >
            relic reset
          </button>
        </div>
      </div>

      <div className="inspector-section upgrades-section">
        <span className="section-kicker">PERMANENT UPGRADES</span>
        <div className="upgrade-list">
          {(Object.keys(UPGRADE_LABELS) as Array<keyof UpgradeLevels>).map(
            (upgrade) => {
              const definition = UPGRADE_LABELS[upgrade]
              const level = simulation.upgrades[upgrade]
              const cost = UPGRADE_COSTS[upgrade]
              return (
                <button
                  type="button"
                  className="upgrade-row"
                  key={upgrade}
                  disabled={simulation.prestigeCurrency < cost}
                  onClick={() => buyUpgrade(upgrade)}
                >
                  <span>
                    <strong>{definition.label}</strong>
                    <small>
                      {definition.detail} · lv {level}
                    </small>
                  </span>
                  <b>{cost} ◈</b>
                </button>
              )
            },
          )}
        </div>
      </div>
    </aside>
  )
}

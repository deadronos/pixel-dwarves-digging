import { BIOME_DEFINITIONS } from '../game/content'
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
  const remaining = simulation.world.cells.filter(
    (cell) => cell.block !== 'air',
  ).length
  const total = remaining + simulation.totalCleared
  const progress =
    total === 0 ? 100 : Math.round((simulation.totalCleared / total) * 100)
  const centerBiome =
    simulation.world.biomes[Math.floor(simulation.world.width / 2)]
  const biome = BIOME_DEFINITIONS[centerBiome]

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
        </dl>
      </div>

      <div className="inspector-section">
        <span className="section-kicker">DIRECTIVE</span>
        <p className="directive">
          {simulation.policy.workPreference.replace('-', ' ')} ·{' '}
          {simulation.policy.haulingPreference.replace('-', ' ')}
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

import { useState } from 'react'
import { BLOCK_LABELS } from '../game/content'
import { FREIGHT_SETUP_STONE } from '../game/logistics/freight'
import { SHIPMENT_RESERVES } from '../game/logistics/shipments'
import { UPGRADE_COSTS } from '../game/progression'
import { selectInspectorViewModel } from '../game/selectors'
import { SIMULATION_TICK_MS, useGameStore } from '../game/state'
import type { ShipmentMode, UpgradeLevels } from '../game/types'

const FREIGHT_STATUS = {
  off: '',
  'waiting-for-depot': 'Waiting for a distant, connected depot.',
  'waiting-for-stone': `Waiting for ${FREIGHT_SETUP_STONE} spare stone to set up.`,
  setup: 'Setting up the freight route.',
  disconnected: 'Waiting for a walking route to the main stockpile.',
  backpressure: 'Waiting for room in the main stockpile.',
  starved: 'Waiting for cargo at the depot.',
  'workshop-supply': 'Holding the depot cargo for a workshop batch.',
  ready: 'Cargo ready for the main stockpile.',
}

const UPGRADE_LABELS: Record<
  keyof UpgradeLevels,
  { label: string; detail: string }
> = {
  toolPower: { label: 'Stronger tools', detail: 'shorter dig cycles' },
  moveSpeed: { label: 'Lightweight gear', detail: 'faster travel' },
  satchel: { label: 'Bigger satchels', detail: 'carry more per trip' },
  extraBunks: { label: 'Extra bunk', detail: 'one more starting dwarf' },
  prospecting: { label: 'Better prospecting', detail: 'sharper mineral odds' },
}

export default function Inspector() {
  const [activeTab, setActiveTab] = useState<'colony' | 'upgrades'>('colony')
  const prestige = useGameStore((state) => state.prestige)
  const buyUpgrade = useGameStore((state) => state.buyUpgrade)
  const setShipmentMode = useGameStore((state) => state.setShipmentMode)
  const setFreightEnabled = useGameStore((state) => state.setFreightEnabled)
  const setWorkshopEnabled = useGameStore((state) => state.setWorkshopEnabled)
  const setSecondCrew = useGameStore((state) => state.setSecondCrew)
  const inspector = useGameStore(selectInspectorViewModel)
  const { freight, workshop, secondCrew } = inspector
  const { mode, shipped, ready, hasStockpile, ticksUntilDispatch, completed } =
    inspector.shipments
  const nextShipmentSeconds = Math.ceil(
    (ticksUntilDispatch * SIMULATION_TICK_MS) / 1_000,
  )

  const canAffordAnyUpgrade = (
    Object.keys(UPGRADE_LABELS) as Array<keyof UpgradeLevels>
  ).some((upgrade) => inspector.prestige.currency >= UPGRADE_COSTS[upgrade])

  return (
    <aside className="inspector">
      <div className="inspector-section progress-section">
        <div className="section-heading">
          <span className="section-kicker">EXCAVATION</span>
          <strong>{inspector.progress}%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${inspector.progress}%` }} />
        </div>
        <p>
          {inspector.totalCleared.toLocaleString()} cleared /{' '}
          {inspector.remainingSolids.toLocaleString()} blocks remain
        </p>
      </div>

      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="Inspector views"
      >
        <button
          type="button"
          role="tab"
          id="tab-colony"
          aria-selected={activeTab === 'colony'}
          aria-controls="panel-colony"
          className={
            activeTab === 'colony' ? 'inspector-tab active' : 'inspector-tab'
          }
          onClick={() => setActiveTab('colony')}
        >
          COLONY
        </button>
        <button
          type="button"
          role="tab"
          id="tab-upgrades"
          aria-selected={activeTab === 'upgrades'}
          aria-controls="panel-upgrades"
          className={
            activeTab === 'upgrades' ? 'inspector-tab active' : 'inspector-tab'
          }
          onClick={() => setActiveTab('upgrades')}
        >
          UPGRADES
          {canAffordAnyUpgrade ? (
            <span
              className="tab-indicator"
              title="Upgrades available"
              aria-hidden="true"
            >
              ●
            </span>
          ) : null}
        </button>
      </div>

      <div
        role="tabpanel"
        id="panel-colony"
        aria-labelledby="tab-colony"
        hidden={activeTab !== 'colony'}
      >
        <div className="inspector-section">
          <span className="section-kicker">COLONY</span>
          <dl className="stat-list">
            <div>
              <dt>dwarves</dt>
              <dd>{inspector.dwarfCounts.total}</dd>
            </div>
            <div>
              <dt>on task</dt>
              <dd>{inspector.dwarfCounts.onTask}</dd>
            </div>
            <div>
              <dt>band</dt>
              <dd>{inspector.biomeLabel}</dd>
            </div>
            <div>
              <dt>relics found</dt>
              <dd>{inspector.discoveredRelics}</dd>
            </div>
            <div>
              <dt>main storage</dt>
              <dd>
                {inspector.mainStockpile.stored.toLocaleString()} /{' '}
                {inspector.mainStockpile.capacity.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt>free capacity</dt>
              <dd>{inspector.storageDiagnostics.availableCapacity}</dd>
            </div>
            <div>
              <dt>outposts</dt>
              <dd>{inspector.buildingCounts.outposts}</dd>
            </div>
            <div>
              <dt>depots</dt>
              <dd>{inspector.buildingCounts.depots}</dd>
            </div>
            <div>
              <dt>building</dt>
              <dd>{inspector.constructionCount}</dd>
            </div>
            <div>
              <dt>access requests</dt>
              <dd>{inspector.openAccessRequests}</dd>
            </div>
            <div>
              <dt>recovery</dt>
              <dd>{inspector.dwarfCounts.inRecovery}</dd>
            </div>
            <div>
              <dt>world floor</dt>
              <dd>bedrock</dd>
            </div>
            <div>
              <dt>safety</dt>
              <dd>{inspector.safetySummary}</dd>
            </div>
          </dl>
        </div>

        <div className="inspector-section">
          <span className="section-kicker">STORAGE LOGISTICS</span>
          <p className="directive">
            {inspector.storageDiagnostics.occupiedCapacity.toLocaleString()} /{' '}
            {inspector.storageDiagnostics.totalCapacity.toLocaleString()}{' '}
            occupied · {inspector.storageDiagnostics.reservedCapacity} reserved
          </p>
          <ul className="muted-copy">
            {inspector.storageDiagnostics.expansion.map((candidate) => (
              <li key={candidate.kind}>
                {candidate.kind.replace('-', ' ')}:{' '}
                {candidate.reason.replaceAll('-', ' ')}
              </li>
            ))}
          </ul>
        </div>

        <div className="inspector-section">
          <label className="section-kicker" htmlFor="shipment-mode">
            SURFACE SHIPMENTS
          </label>
          <select
            id="shipment-mode"
            className="shipment-mode"
            value={mode}
            onChange={(event) =>
              setShipmentMode(event.target.value as ShipmentMode)
            }
          >
            <option value="off">Keep stock</option>
            <option value="spoil">Ship common spoil</option>
            <option value="surplus">Ship spoil and ores</option>
          </select>
          {(mode !== 'off' || shipped > 0) && (
            <p className="directive">
              {shipped.toLocaleString()} shipped this run
            </p>
          )}
          {mode !== 'off' && (
            <>
              <p className="muted-copy">
                {completed
                  ? 'Run complete.'
                  : !hasStockpile
                    ? 'Waiting for the main stockpile.'
                    : ready === 0
                      ? 'Waiting for eligible surplus at the main stockpile.'
                      : `${ready} ready · dispatch in ${nextShipmentSeconds}s at 1×`}
              </p>
              <p className="muted-copy">
                Keeps {SHIPMENT_RESERVES.stone} stone,{' '}
                {SHIPMENT_RESERVES.common} of each other common material,{' '}
                {SHIPMENT_RESERVES.ore} of each ore, and all relics.
                Construction and emergency supplies are also protected.
              </p>
            </>
          )}
        </div>

        <div className="inspector-section">
          <label className="dynamic-camera-toggle">
            <input
              type="checkbox"
              checked={freight.status !== 'off'}
              onChange={(event) => setFreightEnabled(event.target.checked)}
            />
            Depot freight
          </label>
          {(freight.status !== 'off' || freight.moved > 0) && (
            <p className="directive">
              {freight.moved.toLocaleString()} moved this run
              {freight.depotPosition &&
                ` · depot (${freight.depotPosition.x}, ${freight.depotPosition.y})`}
            </p>
          )}
          {freight.status !== 'off' && (
            <p className="muted-copy">
              {completed ? 'Run complete.' : FREIGHT_STATUS[freight.status]}
            </p>
          )}
        </div>

        <div className="inspector-section">
          <label className="dynamic-camera-toggle">
            <input
              type="checkbox"
              checked={workshop.enabled}
              onChange={(event) => setWorkshopEnabled(event.target.checked)}
            />
            Spoil workshop
          </label>
          {(workshop.enabled || workshop.produced > 0) && (
            <p className="directive">
              {workshop.produced.toLocaleString()} workshop{' '}
              {workshop.produced === 1 ? 'batch' : 'batches'} this run
            </p>
          )}
          {workshop.enabled && (
            <p className="muted-copy">
              {workshop.reason === 'completed'
                ? 'Run complete.'
                : !workshop.site
                  ? 'Waiting for a completed depot or outpost.'
                  : workshop.input
                    ? `3 ${BLOCK_LABELS[workshop.input]} → 1 Stone at ${workshop.site.type} (${workshop.site.position.x}, ${workshop.site.position.y}).`
                    : 'Waiting for spare common spoil at a depot or outpost.'}
            </p>
          )}
        </div>

        <div className="inspector-section">
          <label className="dynamic-camera-toggle">
            <input
              type="checkbox"
              checked={secondCrew}
              onChange={(event) => setSecondCrew(event.target.checked)}
            />
            Second mining crew
          </label>
          {secondCrew && (
            <p className="muted-copy">
              Idle miners prefer a second safe face with a comparable haul.
            </p>
          )}
        </div>

        <div className="inspector-section">
          <span className="section-kicker">DIRECTIVE</span>
          <p className="directive">{inspector.directiveSummary}</p>
          <p className="muted-copy">
            The colony selects reachable work from this policy. Terrain decides
            the cost.
          </p>
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-upgrades"
        aria-labelledby="tab-upgrades"
        hidden={activeTab !== 'upgrades'}
      >
        <div className="inspector-section prestige-section">
          <div className="section-heading">
            <span className="section-kicker">PRESTIGE</span>
            <strong className="currency">
              {inspector.prestige.currency} ◈
            </strong>
          </div>
          <p className="muted-copy">
            Clear the map for a full reward. A relic permits an earlier, smaller
            reset.
          </p>
          <div className="prestige-actions">
            <button
              type="button"
              className="action-button"
              disabled={!inspector.prestige.canFullClear}
              onClick={() => prestige('full-clear')}
            >
              full clear
            </button>
            <button
              type="button"
              className="action-button"
              disabled={!inspector.prestige.canRelicReset}
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
                const level = inspector.upgrades[upgrade]
                const cost = UPGRADE_COSTS[upgrade]
                return (
                  <button
                    type="button"
                    className="upgrade-row"
                    key={upgrade}
                    disabled={inspector.prestige.currency < cost}
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
      </div>
    </aside>
  )
}

import { useMemo } from 'react'
import {
  BLOCK_COLORS,
  BLOCK_LABELS,
  MINEABLE_BLOCKS,
  MINEABLE_BLOCK_SET,
} from '../game/content'
import { getAggregateInventory } from '../game/logistics'
import { useGameStore } from '../game/state'

export default function Hud() {
  const simulation = useGameStore((state) => state.simulation)
  const paused = useGameStore((state) => state.paused)
  const speed = useGameStore((state) => state.speed)
  const saveStatus = useGameStore((state) => state.saveStatus)
  const remaining = useMemo(
    () =>
      simulation.world.cells.filter((cell) => MINEABLE_BLOCK_SET.has(cell.block))
        .length,
    [simulation.world.cells],
  )
  const inventory = useMemo(
    () => getAggregateInventory(simulation),
    [simulation],
  )
  const aggregateStored = useMemo(
    () => Object.values(inventory).reduce((total, amount) => total + amount, 0),
    [inventory],
  )

  return (
    <header className="hud">
      <div className="topbar hud-brand">
        <div>
          <p className="eyebrow">
            AUTONOMOUS EXCAVATION / RUN{' '}
            {String(simulation.world.runNumber).padStart(2, '0')}
          </p>
          <h1>PIXEL DWARVES</h1>
          <p className="run-caption">
            seed <span>{simulation.world.seed}</span> · tick {simulation.tick} ·{' '}
            {paused ? 'paused' : `${speed}× live`}
          </p>
        </div>
        <div className="run-status">
          <span className="status-chip">
            {simulation.completed
              ? 'READY TO PRESTIGE'
              : simulation.safety.phase === 'blocked'
                ? 'COLONY BLOCKED'
                : simulation.safety.phase === 'bootstrap'
                  ? 'BOOTSTRAP SAFETY'
                  : 'DIGGING'}
          </span>
          <span className="save-state">{saveStatus}</span>
        </div>
      </div>

      <section className="inventory-strip" aria-label="Global inventory">
        <div className="inventory-heading">
          <span className="section-kicker">GLOBAL INVENTORY</span>
          <strong>
            {aggregateStored.toLocaleString()} blocks stored / in transit
          </strong>
        </div>
        <div className="inventory-list">
          {MINEABLE_BLOCKS.map((block) => (
            <div className="inventory-item" key={block}>
              <span
                className="material-swatch"
                style={{ backgroundColor: BLOCK_COLORS[block] }}
              />
              <span>{BLOCK_LABELS[block]}</span>
              <strong>{inventory[block].toLocaleString()}</strong>
            </div>
          ))}
        </div>
        <div className="inventory-summary">
          <span>remaining</span>
          <strong>{remaining.toLocaleString()}</strong>
          <span>
            {
              simulation.accessRequests.filter(
                (request) => request.status === 'open',
              ).length
            }{' '}
            access requests
          </span>
          <span>
            safety: {simulation.safety.phase}
            {simulation.safety.blockedReason
              ? ` · ${simulation.safety.blockedReason.replaceAll('-', ' ')}`
              : ''}
          </span>
        </div>
      </section>
    </header>
  )
}

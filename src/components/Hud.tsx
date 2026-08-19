import { BLOCK_COLORS, BLOCK_LABELS, MINEABLE_BLOCKS } from '../game/content'
import { useGameStore } from '../game/state'

export default function Hud() {
  const simulation = useGameStore((state) => state.simulation)
  const paused = useGameStore((state) => state.paused)
  const speed = useGameStore((state) => state.speed)
  const saveStatus = useGameStore((state) => state.saveStatus)
  const remaining = simulation.world.cells.filter(
    (cell) => cell.block !== 'air',
  ).length

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
            {simulation.completed ? 'READY TO PRESTIGE' : 'DIGGING'}
          </span>
          <span className="save-state">{saveStatus}</span>
        </div>
      </div>

      <section className="inventory-strip" aria-label="Global inventory">
        <div className="inventory-heading">
          <span className="section-kicker">GLOBAL INVENTORY</span>
          <strong>
            {simulation.totalCleared.toLocaleString()} blocks stored
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
              <strong>{simulation.inventory[block].toLocaleString()}</strong>
            </div>
          ))}
        </div>
        <div className="inventory-summary">
          <span>remaining</span>
          <strong>{remaining.toLocaleString()}</strong>
        </div>
      </section>
    </header>
  )
}

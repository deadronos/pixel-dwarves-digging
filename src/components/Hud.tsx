import { useState } from 'react'
import { BLOCK_COLORS, BLOCK_LABELS, MINEABLE_BLOCKS } from '../game/content'
import { selectHudViewModel } from '../game/selectors'
import { useGameStore } from '../game/state'
import SettingsModal from './SettingsModal'

type HudProps = {
  dynamicCameraPaused?: boolean
}

export default function Hud({ dynamicCameraPaused = false }: HudProps) {
  const paused = useGameStore((state) => state.paused)
  const speed = useGameStore((state) => state.speed)
  const saveStatus = useGameStore((state) => state.saveStatus)
  const hud = useGameStore(selectHudViewModel)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <header className="hud">
      <div className="topbar hud-brand">
        <div>
          <p className="eyebrow">
            AUTONOMOUS EXCAVATION / RUN {String(hud.runNumber).padStart(2, '0')}
          </p>
          <h1>PIXEL DWARVES</h1>
          <p className="run-caption">
            seed <span>{hud.seed}</span> · tick {hud.tick} ·{' '}
            {paused ? 'paused' : `${speed}× live`}
          </p>
        </div>
        <div className="run-status">
          <div className="status-badges">
            <span className="status-chip">{hud.statusChip}</span>
            <span className="save-state">{saveStatus}</span>
          </div>
          <button
            type="button"
            className="gear-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        dynamicCameraPaused={dynamicCameraPaused}
      />

      <section className="inventory-strip" aria-label="Global inventory">
        <div className="inventory-heading">
          <span className="section-kicker">GLOBAL INVENTORY</span>
          <strong>
            {hud.aggregateStored.toLocaleString()} blocks stored / in transit
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
              <strong>{hud.inventory[block].toLocaleString()}</strong>
            </div>
          ))}
        </div>
        <div className="inventory-summary">
          <span>remaining</span>
          <strong>{hud.remainingSolids.toLocaleString()}</strong>
        </div>
      </section>
    </header>
  )
}

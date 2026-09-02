import { BLOCK_LABELS } from '../game/content'
import type { SimulationSpeed } from '../game/state'
import { useGameStore } from '../game/state'
import type { ConstructionPolicy } from '../game/types'

export default function ControlBar() {
  const paused = useGameStore((state) => state.paused)
  const speed = useGameStore((state) => state.speed)
  const policy = useGameStore((state) => state.simulation.policy)
  const constructionPolicy = useGameStore(
    (state) => state.simulation.constructionPolicy,
  )
  const setPaused = useGameStore((state) => state.setPaused)
  const setSpeed = useGameStore((state) => state.setSpeed)
  const setPolicy = useGameStore((state) => state.setPolicy)
  const setMaterialPriority = useGameStore((state) => state.setMaterialPriority)
  const setConstructionPolicy = useGameStore(
    (state) => state.setConstructionPolicy,
  )

  return (
    <section className="control-bar" aria-label="Colony controls">
      <div className="control-group time-controls">
        <span className="control-label">TIME</span>
        <button
          type="button"
          className={paused ? 'control-button active' : 'control-button'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? 'resume' : 'pause'}
        </button>
        {[1, 2, 4].map((value) => (
          <button
            type="button"
            className={
              speed === value ? 'control-button active' : 'control-button'
            }
            key={value}
            onClick={() => setSpeed(value as SimulationSpeed)}
          >
            {value}×
          </button>
        ))}
      </div>

      <div className="control-group policy-selects">
        <div className="policy-field">
          <label className="control-label" htmlFor="work-preference">
            WORK
          </label>
          <select
            id="work-preference"
            value={policy.workPreference}
            onChange={(event) =>
              setPolicy({
                workPreference: event.target
                  .value as typeof policy.workPreference,
              })
            }
          >
            <option value="nearest">nearest exposed</option>
            <option value="ore-first">ore first</option>
            <option value="deepest-first">deepest first</option>
          </select>
        </div>

        <div className="policy-field">
          <label className="control-label" htmlFor="construction-policy">
            BUILD
          </label>
          <select
            id="construction-policy"
            value={constructionPolicy}
            onChange={(event) =>
              setConstructionPolicy(event.target.value as ConstructionPolicy)
            }
          >
            <option value="conserve">essential routes</option>
            <option value="balanced">routes + outposts</option>
            <option value="expand">expand logistics</option>
          </select>
        </div>

        <div className="policy-field">
          <label className="control-label" htmlFor="hauling-preference">
            HAUL
          </label>
          <select
            id="hauling-preference"
            value={policy.haulingPreference}
            onChange={(event) =>
              setPolicy({
                haulingPreference: event.target
                  .value as typeof policy.haulingPreference,
              })
            }
          >
            <option value="nearest-stockpile">main stockpile first</option>
            <option value="finish-current-route">finish current route</option>
          </select>
        </div>
      </div>

      <div className="control-group material-priority">
        <span className="control-label">PRIORITY</span>
        {(['coal', 'iron', 'crystal', 'relic'] as const).map((material) => (
          <label
            className={
              policy.materialPriority[material]
                ? 'priority-toggle active'
                : 'priority-toggle'
            }
            key={material}
          >
            <input
              type="checkbox"
              checked={policy.materialPriority[material]}
              onChange={(event) =>
                setMaterialPriority(material, event.target.checked)
              }
            />
            {BLOCK_LABELS[material]}
          </label>
        ))}
      </div>
    </section>
  )
}

import { useRef, useState } from 'react'
import { BLOCK_LABELS } from '../game/content'
import type { SimulationSpeed } from '../game/state'
import { useGameStore } from '../game/state'
import type { ConstructionPolicy } from '../game/types'

function downloadSave(payload: string) {
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'pixel-dwarves-save.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function ControlBar() {
  const paused = useGameStore((state) => state.paused)
  const speed = useGameStore((state) => state.speed)
  const policy = useGameStore((state) => state.simulation.policy)
  const constructionPolicy = useGameStore(
    (state) => state.simulation.constructionPolicy,
  )
  const saveError = useGameStore((state) => state.saveError)
  const setPaused = useGameStore((state) => state.setPaused)
  const setSpeed = useGameStore((state) => state.setSpeed)
  const setPolicy = useGameStore((state) => state.setPolicy)
  const setMaterialPriority = useGameStore((state) => state.setMaterialPriority)
  const setConstructionPolicy = useGameStore(
    (state) => state.setConstructionPolicy,
  )
  const saveLocally = useGameStore((state) => state.saveLocally)
  const exportSave = useGameStore((state) => state.exportSave)
  const importSave = useGameStore((state) => state.importSave)
  const newRun = useGameStore((state) => state.newRun)
  const resetProgress = useGameStore((state) => state.resetProgress)
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    importSave(await file.text())
    setImporting(false)
  }

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

      <div className="control-group">
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

      <div className="control-group">
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

      <div className="control-group">
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

      <div className="control-group save-controls">
        <span className="control-label">RUN FILE</span>
        <button type="button" className="control-button" onClick={saveLocally}>
          save
        </button>
        <button
          type="button"
          className="control-button"
          onClick={() => downloadSave(exportSave())}
        >
          export
        </button>
        <button
          type="button"
          className="control-button"
          onClick={() => inputRef.current?.click()}
          disabled={importing}
        >
          {importing ? 'reading…' : 'import'}
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            void handleImport(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      <div className="control-group destructive-controls">
        <button
          type="button"
          className="control-button subtle"
          onClick={() => {
            if (
              window.confirm(
                'Start a new generated map while keeping permanent upgrades?',
              )
            )
              newRun()
          }}
        >
          new run
        </button>
        <button
          type="button"
          className="control-button danger"
          onClick={() => {
            if (
              window.confirm(
                'Reset all progress and start over? This cannot be undone.',
              )
            )
              resetProgress()
          }}
        >
          reset
        </button>
      </div>

      {saveError ? (
        <p className="save-error" role="alert">
          {saveError}
        </p>
      ) : null}
    </section>
  )
}

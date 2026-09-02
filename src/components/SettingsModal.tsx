import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../game/state'

function downloadSave(payload: string) {
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'pixel-dwarves-save.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  dynamicCameraPaused?: boolean
}

export default function SettingsModal({
  isOpen,
  onClose,
  dynamicCameraPaused = false,
}: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [copiedSeed, setCopiedSeed] = useState(false)

  const dynamicCameraEnabled = useGameStore(
    (state) => state.dynamicCameraEnabled,
  )
  const setDynamicCameraEnabled = useGameStore(
    (state) => state.setDynamicCameraEnabled,
  )
  const saveStatus = useGameStore((state) => state.saveStatus)
  const saveError = useGameStore((state) => state.saveError)
  const saveLocally = useGameStore((state) => state.saveLocally)
  const exportSave = useGameStore((state) => state.exportSave)
  const importSave = useGameStore((state) => state.importSave)
  const newRun = useGameStore((state) => state.newRun)
  const resetProgress = useGameStore((state) => state.resetProgress)
  const seed = useGameStore((state) => state.simulation.world.seed)
  const runNumber = useGameStore((state) => state.simulation.world.runNumber)

  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null

      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal()
        }
      } else {
        dialog.setAttribute('open', '')
      }
    } else {
      if (typeof dialog.close === 'function') {
        if (dialog.open) {
          dialog.close()
        }
      } else {
        dialog.removeAttribute('open')
      }

      if (
        previouslyFocusedRef.current &&
        document.contains(previouslyFocusedRef.current)
      ) {
        previouslyFocusedRef.current.focus()
      }
    }
  }, [isOpen])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      onClose()
    }
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    importSave(await file.text())
    setImporting(false)
  }

  const handleCopySeed = async () => {
    try {
      await navigator.clipboard.writeText(seed)
      setCopiedSeed(true)
      setTimeout(() => setCopiedSeed(false), 2000)
    } catch {
      // Clipboard fallback
      setCopiedSeed(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-modal"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }}
      aria-labelledby="settings-dialog-title"
    >
      <div className="modal-content">
        <header className="modal-header">
          <h2 id="settings-dialog-title" className="modal-title">
            SETTINGS
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <section className="modal-section">
          <h3 className="modal-section-title">VIEWPORT & CAMERA</h3>
          <div className="setting-row">
            <label className="dynamic-camera-toggle">
              <input
                type="checkbox"
                checked={dynamicCameraEnabled}
                onChange={(event) =>
                  setDynamicCameraEnabled(event.target.checked)
                }
              />
              DYNAMIC CAMERA
            </label>
            {dynamicCameraPaused ? (
              <span className="camera-pause-status">manual pause</span>
            ) : null}
          </div>
          <p className="setting-description">
            Smoothly pans and centers on active mining fronts during excavation.
          </p>
        </section>

        <section className="modal-section">
          <h3 className="modal-section-title">RUN INFO & SAVE FILE</h3>
          <div className="seed-display-row">
            <span className="seed-label">
              RUN {String(runNumber).padStart(2, '0')} SEED:
            </span>
            <code className="seed-code">{seed}</code>
            <button
              type="button"
              className="control-button subtle seed-copy-btn"
              onClick={handleCopySeed}
            >
              {copiedSeed ? 'copied!' : 'copy'}
            </button>
          </div>

          <div className="save-status-row">
            <span>SAVE STATUS:</span>
            <span className="status-chip">{saveStatus}</span>
          </div>

          <div className="modal-button-group">
            <button
              type="button"
              className="control-button"
              onClick={saveLocally}
            >
              save locally
            </button>
            <button
              type="button"
              className="control-button"
              onClick={() => downloadSave(exportSave())}
            >
              export json
            </button>
            <button
              type="button"
              className="control-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? 'importing…' : 'import json'}
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void handleImport(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {saveError ? (
            <p className="save-error" role="alert">
              {saveError}
            </p>
          ) : null}
        </section>

        <section className="modal-section danger-zone">
          <h3 className="modal-section-title danger">DANGER ZONE</h3>
          <p className="setting-description">
            Start a fresh run with the same permanent upgrades or reset all
            progress entirely.
          </p>
          <div className="modal-button-group">
            <button
              type="button"
              className="control-button subtle"
              onClick={() => {
                if (
                  window.confirm(
                    'Start a new generated map while keeping permanent upgrades?',
                  )
                ) {
                  newRun()
                  onClose()
                }
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
                ) {
                  resetProgress()
                  onClose()
                }
              }}
            >
              reset all progress
            </button>
          </div>
        </section>
      </div>
    </dialog>
  )
}

import { lazy, Suspense, useEffect, useState } from 'react'
import ControlBar from './components/ControlBar'
import Hud from './components/Hud'
import Inspector from './components/Inspector'
import { useGameStore } from './game/state'
import type { Position } from './game/types'

const WorldCanvas = lazy(() => import('./components/WorldCanvas'))

/**
 * Owns the per-tick subscriptions (world, dwarves) so only the canvas subtree
 * re-renders on a tick, not the whole App shell.
 */
function WorldStage({
  onTemporaryPauseChange,
  recoveryFocus,
}: {
  onTemporaryPauseChange: (paused: boolean) => void
  recoveryFocus: Position | null
}) {
  const world = useGameStore((state) => state.simulation.world)
  const dwarves = useGameStore((state) => state.simulation.dwarves)
  const constructionOrders = useGameStore(
    (state) => state.simulation.constructionOrders,
  )
  const upgrades = useGameStore((state) => state.simulation.upgrades)
  const speed = useGameStore((state) => state.speed)
  const paused = useGameStore((state) => state.paused)
  const dynamicCameraEnabled = useGameStore(
    (state) => state.dynamicCameraEnabled,
  )
  return (
    <WorldCanvas
      world={world}
      dwarves={dwarves}
      constructionOrders={constructionOrders}
      upgrades={upgrades}
      speed={speed}
      paused={paused}
      dynamicCameraEnabled={dynamicCameraEnabled}
      onTemporaryPauseChange={onTemporaryPauseChange}
      recoveryFocus={recoveryFocus}
    />
  )
}

export default function App() {
  const startSimulation = useGameStore((state) => state.startSimulation)
  const stopSimulation = useGameStore((state) => state.stopSimulation)
  const [dynamicCameraPaused, setDynamicCameraPaused] = useState(false)
  const [recoveryFocus, setRecoveryFocus] = useState<Position | null>(null)

  useEffect(() => {
    startSimulation()
    return stopSimulation
  }, [startSimulation, stopSimulation])

  return (
    <main className="app-shell">
      <Hud
        dynamicCameraPaused={dynamicCameraPaused}
        onLocateRecovery={(position) => setRecoveryFocus({ ...position })}
      />
      <div className="main-layout">
        <section className="world-stage" aria-label="Terrain workspace">
          <Suspense
            fallback={
              <div
                className="world-canvas"
                role="img"
                aria-label="Loading terrain simulation"
              >
                loading terrain…
              </div>
            }
          >
            <WorldStage
              onTemporaryPauseChange={setDynamicCameraPaused}
              recoveryFocus={recoveryFocus}
            />
          </Suspense>
        </section>
        <Inspector />
      </div>
      <ControlBar />
    </main>
  )
}

import { lazy, Suspense, useEffect, useState } from 'react'
import ControlBar from './components/ControlBar'
import Hud from './components/Hud'
import Inspector from './components/Inspector'
import { useGameStore } from './game/state'

const WorldCanvas = lazy(() => import('./components/WorldCanvas'))

/**
 * Owns the per-tick subscriptions (world, dwarves) so only the canvas subtree
 * re-renders on a tick, not the whole App shell.
 */
function WorldStage({
  onTemporaryPauseChange,
}: {
  onTemporaryPauseChange: (paused: boolean) => void
}) {
  const world = useGameStore((state) => state.simulation.world)
  const dwarves = useGameStore((state) => state.simulation.dwarves)
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
      upgrades={upgrades}
      speed={speed}
      paused={paused}
      dynamicCameraEnabled={dynamicCameraEnabled}
      onTemporaryPauseChange={onTemporaryPauseChange}
    />
  )
}

export default function App() {
  const startSimulation = useGameStore((state) => state.startSimulation)
  const stopSimulation = useGameStore((state) => state.stopSimulation)
  const [dynamicCameraPaused, setDynamicCameraPaused] = useState(false)

  useEffect(() => {
    startSimulation()
    return stopSimulation
  }, [startSimulation, stopSimulation])

  return (
    <main className="app-shell">
      <Hud dynamicCameraPaused={dynamicCameraPaused} />
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
            <WorldStage onTemporaryPauseChange={setDynamicCameraPaused} />
          </Suspense>
        </section>
        <Inspector />
      </div>
      <ControlBar />
    </main>
  )
}

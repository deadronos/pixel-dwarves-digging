import { lazy, Suspense, useEffect, useState } from 'react'
import ControlBar from './components/ControlBar'
import Hud from './components/Hud'
import Inspector from './components/Inspector'
import { useGameStore } from './game/state'

const WorldCanvas = lazy(() => import('./components/WorldCanvas'))

export default function App() {
  const simulation = useGameStore((state) => state.simulation)
  const dynamicCameraEnabled = useGameStore(
    (state) => state.dynamicCameraEnabled,
  )
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
            <WorldCanvas
              world={simulation.world}
              dwarves={simulation.dwarves}
              dynamicCameraEnabled={dynamicCameraEnabled}
              onTemporaryPauseChange={setDynamicCameraPaused}
            />
          </Suspense>
        </section>
        <Inspector />
      </div>
      <ControlBar />
    </main>
  )
}

import { lazy, Suspense, useEffect } from 'react'
import ControlBar from './components/ControlBar'
import Hud from './components/Hud'
import Inspector from './components/Inspector'
import { useGameStore } from './game/state'

const WorldCanvas = lazy(() => import('./components/WorldCanvas'))

export default function App() {
  const simulation = useGameStore((state) => state.simulation)
  const startSimulation = useGameStore((state) => state.startSimulation)
  const stopSimulation = useGameStore((state) => state.stopSimulation)

  useEffect(() => {
    startSimulation()
    return stopSimulation
  }, [startSimulation, stopSimulation])

  return (
    <main className="app-shell">
      <Hud />
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
            />
          </Suspense>
        </section>
        <Inspector />
      </div>
      <ControlBar />
    </main>
  )
}

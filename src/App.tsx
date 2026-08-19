import { useEffect } from 'react'
import ControlBar from './components/ControlBar'
import Hud from './components/Hud'
import Inspector from './components/Inspector'
import WorldCanvas from './components/WorldCanvas'
import { useGameStore } from './game/state'

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
          <WorldCanvas world={simulation.world} dwarves={simulation.dwarves} />
        </section>
        <Inspector />
      </div>
      <ControlBar />
    </main>
  )
}

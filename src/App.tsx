import { useEffect } from 'react'
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
      <header className="topbar">
        <div>
          <p className="eyebrow">
            AUTONOMOUS EXCAVATION / RUN{' '}
            {String(simulation.world.runNumber).padStart(2, '0')}
          </p>
          <h1>PIXEL DWARVES</h1>
        </div>
        <span className="status-chip">
          {simulation.completed ? 'READY TO PRESTIGE' : 'DIGGING'}
        </span>
      </header>
      <section className="world-stage" aria-label="Terrain workspace">
        <WorldCanvas world={simulation.world} dwarves={simulation.dwarves} />
      </section>
    </main>
  )
}

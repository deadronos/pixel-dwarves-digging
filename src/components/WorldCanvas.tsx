import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { DwarfState, World } from '../game/types'
import BuildingLayer from './BuildingLayer'
import DwarfLayer from './DwarfLayer'
import TerrainLayer from './TerrainLayer'

type WorldCanvasProps = {
  world: World
  dwarves: DwarfState[]
}

function WorldScene({ world, dwarves }: WorldCanvasProps) {
  return (
    <>
      <group position={[-world.width / 2, -world.height / 2, 0]}>
        <TerrainLayer world={world} />
        <BuildingLayer world={world} />
        <DwarfLayer dwarves={dwarves} />
      </group>
      <OrbitControls
        enableRotate={false}
        enablePan
        minZoom={5}
        maxZoom={22}
        screenSpacePanning
        zoomToCursor
      />
    </>
  )
}

export default function WorldCanvas({ world, dwarves }: WorldCanvasProps) {
  return (
    <div
      className="world-canvas"
      role="img"
      aria-label="Side-on pixel terrain simulation"
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 100], zoom: 9 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
        onCreated={({ gl }) => gl.setClearColor('#161916')}
      >
        <WorldScene world={world} dwarves={dwarves} />
      </Canvas>
    </div>
  )
}

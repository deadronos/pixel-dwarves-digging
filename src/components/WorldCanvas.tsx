import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { DwarfState, World } from '../game/types'
import BuildingLayer from './BuildingLayer'
import {
  createCameraPauseController,
  dampCameraValue,
  getCameraTarget,
  isDynamicCameraActive,
} from './cameraTracking'
import DwarfLayer from './DwarfLayer'
import TerrainLayer from './TerrainLayer'

type WorldCanvasProps = {
  world: World
  dwarves: DwarfState[]
  dynamicCameraEnabled: boolean
  onTemporaryPauseChange: (paused: boolean) => void
}

function WorldScene({
  world,
  dwarves,
  dynamicCameraEnabled,
  onTemporaryPauseChange,
}: WorldCanvasProps) {
  const { camera, size } = useThree()
  const pauseController = useRef(createCameraPauseController())
  const temporaryPaused = useRef(false)

  const reportPause = (paused: boolean) => {
    if (temporaryPaused.current === paused) return
    temporaryPaused.current = paused
    onTemporaryPauseChange(paused)
  }

  useFrame((_, delta) => {
    const paused = pauseController.current.isPaused(performance.now())
    reportPause(paused)
    if (!isDynamicCameraActive(dynamicCameraEnabled, paused)) return

    const target = getCameraTarget(
      world,
      dwarves,
      size.width / Math.max(1, size.height),
    )
    const centerX = target.center.x - world.width / 2
    const centerY = target.center.y - world.height / 2
    camera.position.x = dampCameraValue(
      camera.position.x,
      centerX,
      delta,
      2.2,
    )
    camera.position.y = dampCameraValue(
      camera.position.y,
      centerY,
      delta,
      2.2,
    )
    const zoomRate = target.zoom < camera.zoom ? 5.5 : 2.2
    camera.zoom = dampCameraValue(camera.zoom, target.zoom, delta, zoomRate)
    camera.updateProjectionMatrix()
  })

  const registerManualInput = () => {
    pauseController.current.onInput(performance.now())
    reportPause(true)
  }

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
        onStart={registerManualInput}
        onChange={registerManualInput}
        screenSpacePanning
        zoomToCursor
      />
    </>
  )
}

export default function WorldCanvas(props: WorldCanvasProps) {
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
        <WorldScene {...props} />
      </Canvas>
    </div>
  )
}

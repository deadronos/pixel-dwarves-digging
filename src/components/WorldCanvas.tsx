import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { DwarfState, World } from '../game/types'
import BuildingLayer from './BuildingLayer'
import {
  CAMERA_PAUSE_MS,
  createCameraPauseController,
  dampCameraValue,
  getCameraTarget,
  hasCameraSettled,
  isDynamicCameraActive,
  syncCameraControlTarget,
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
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const pauseController = useRef(createCameraPauseController())
  const temporaryPaused = useRef(false)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
    }
  }, [])

  // Demand rendering: request a frame whenever the rendered simulation changes.
  // Terrain instance matrices are mutated through refs rather than JSX props,
  // so this is the reliable wake-up for mining and dwarf movement.
  useEffect(() => {
    if (world && dwarves) invalidate()
  }, [world, dwarves, invalidate])

  // Enabling the follow camera should start animating even while the
  // simulation is paused and no simulation update would otherwise arrive.
  useEffect(() => {
    if (dynamicCameraEnabled) invalidate()
  }, [dynamicCameraEnabled, invalidate])

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
    const targetX = target.center.x - world.width / 2
    const targetY = target.center.y - world.height / 2
    camera.position.x = dampCameraValue(camera.position.x, targetX, delta, 2.2)
    camera.position.y = dampCameraValue(camera.position.y, targetY, delta, 2.2)
    const zoomRate = target.zoom < camera.zoom ? 5.5 : 2.2
    camera.zoom = dampCameraValue(camera.zoom, target.zoom, delta, zoomRate)
    camera.updateProjectionMatrix()
    if (controlsRef.current) {
      syncCameraControlTarget(controlsRef.current.target, camera.position)
    }

    // Keep requesting frames until the camera settles, otherwise demand
    // rendering would freeze the follow animation mid-flight.
    if (
      !hasCameraSettled(
        camera.position,
        camera.zoom,
        { x: targetX, y: targetY },
        target.zoom,
      )
    ) {
      invalidate()
    }
  })

  const registerManualStart = () => {
    pauseController.current.onDragStart(performance.now())
    reportPause(true)
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
  }

  const registerManualEnd = () => {
    pauseController.current.onDragEnd(performance.now())
    reportPause(true)
    // Demand rendering stops once input stops, so wake the loop when the
    // manual-pause window expires to let the camera resume following.
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => invalidate(), CAMERA_PAUSE_MS + 32)
  }

  return (
    <>
      <group position={[-world.width / 2, -world.height / 2, 0]}>
        <TerrainLayer world={world} />
        <BuildingLayer world={world} />
        <DwarfLayer dwarves={dwarves} />
      </group>
      <OrbitControls
        ref={controlsRef}
        enableRotate={false}
        enablePan
        minZoom={5}
        maxZoom={22}
        onStart={registerManualStart}
        onEnd={registerManualEnd}
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
        frameloop="demand"
        gl={{ antialias: false }}
        onCreated={({ gl }) => gl.setClearColor('#161916')}
      >
        <WorldScene {...props} />
      </Canvas>
    </div>
  )
}

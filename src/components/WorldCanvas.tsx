import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MOUSE, TOUCH } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { DwarfState, World } from '../game/types'
import BuildingLayer from './BuildingLayer'
import {
  CAMERA_PAUSE_MS,
  clampCameraCenter,
  createCameraPauseController,
  dampCameraValue,
  getCameraTarget,
  hasCameraSettled,
  isDynamicCameraActive,
  MAX_ZOOM,
  MIN_ZOOM,
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
  // Terrain texels are written imperatively rather than through JSX props,
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

    const target = getCameraTarget(world, dwarves, size)
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

  // Manual pan and zoom must not reveal empty space beyond the world. The
  // scene is offset by half the world size, so convert to world coordinates,
  // clamp, and convert back.
  const clampManualView = () => {
    const clamped = clampCameraCenter(
      {
        x: camera.position.x + world.width / 2,
        y: camera.position.y + world.height / 2,
      },
      camera.zoom,
      size,
      world,
    )
    camera.position.x = clamped.x - world.width / 2
    camera.position.y = clamped.y - world.height / 2
    if (controlsRef.current) {
      syncCameraControlTarget(controlsRef.current.target, camera.position)
    }
  }

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
        // Rotation is disabled, so give the primary button and a single
        // finger the pan gesture instead of the default (unused) rotate.
        mouseButtons={{
          LEFT: MOUSE.PAN,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.PAN,
        }}
        touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onChange={clampManualView}
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
        // `flat` disables tone mapping, so `BLOCK_COLORS` values reach the
        // screen unchanged and the HUD swatches match the map exactly.
        flat
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

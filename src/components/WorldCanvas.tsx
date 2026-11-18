import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { MOUSE, TOUCH } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type {
  ConstructionOrder,
  DwarfState,
  Position,
  UpgradeLevels,
  World,
} from '../game/types'
import BuildingLayer from './BuildingLayer'
import {
  CAMERA_PAUSE_MS,
  clampCameraCenter,
  createCameraPauseController,
  createFollowCamera,
  dampCameraValue,
  getMapFitZoom,
  hasCameraSettled,
  isDynamicCameraActive,
  MAX_ZOOM,
  syncCameraControlTarget,
  type Viewport,
} from './cameraTracking'
import DwarfLayer from './DwarfLayer'
import MiningLayer from './MiningLayer'
import TerrainLayer from './TerrainLayer'

const RECOVERY_FOCUS_ZOOM = 12

type WorldCanvasProps = {
  world: World
  dwarves: DwarfState[]
  constructionOrders: ConstructionOrder[]
  upgrades: UpgradeLevels
  speed: number
  paused: boolean
  dynamicCameraEnabled: boolean
  onTemporaryPauseChange: (paused: boolean) => void
  recoveryFocus: Position | null
}

function WorldScene({
  world,
  dwarves,
  constructionOrders,
  upgrades,
  speed,
  paused,
  dynamicCameraEnabled,
  onTemporaryPauseChange,
  recoveryFocus,
  recenterRequest,
}: WorldCanvasProps & { recenterRequest: number }) {
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const pauseController = useRef(createCameraPauseController())
  const followCamera = useRef(createFollowCamera())
  const temporaryPaused = useRef(false)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousMapFit = useRef<number | null>(null)
  const minZoom = getMapFitZoom(world, size)
  const maxZoom = Math.max(minZoom, MAX_ZOOM)

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
    const now = performance.now()
    const cameraPaused = pauseController.current.isPaused(now)
    reportPause(cameraPaused)
    if (!isDynamicCameraActive(dynamicCameraEnabled, cameraPaused)) return

    const target = followCamera.current.update(world, dwarves, size, now)
    const targetX = target.center.x - world.width / 2
    const targetY = target.center.y - world.height / 2
    camera.position.x = dampCameraValue(camera.position.x, targetX, delta, 2.2)
    camera.position.y = dampCameraValue(camera.position.y, targetY, delta, 2.2)
    const zoomRate = target.zoom < camera.zoom ? 5.5 : 2.2
    camera.zoom = dampCameraValue(camera.zoom, target.zoom, delta, zoomRate)
    clampManualView()
    camera.updateProjectionMatrix()

    // Keep requesting frames until the camera settles, otherwise demand
    // rendering would freeze the follow animation mid-flight.
    if (
      followCamera.current.switching ||
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

  const fitResizedView = useEffectEvent(
    (viewport: Viewport, width: number, height: number) => {
      const fit = getMapFitZoom({ width, height }, viewport)
      const wasFitted =
        previousMapFit.current !== null &&
        Math.abs(camera.zoom - previousMapFit.current) < 0.01
      previousMapFit.current = fit
      camera.zoom = wasFitted ? fit : Math.max(camera.zoom, fit)
      clampManualView()
      camera.updateProjectionMatrix()
      invalidate()
    },
  )

  useEffect(() => {
    fitResizedView(size, world.width, world.height)
  }, [size, world.width, world.height])

  const registerManualStart = () => {
    followCamera.current.reset()
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

  const flushManualDamping = () => {
    const controls = controlsRef.current
    if (!controls) return
    const damping = controls.enableDamping
    controls.enableDamping = false
    controls.update()
    controls.enableDamping = damping
  }

  const focusRecovery = useEffectEvent((position: Position) => {
    flushManualDamping()
    camera.position.x = position.x + 0.5 - world.width / 2
    camera.position.y = position.y + 0.5 - world.height / 2
    camera.zoom = Math.max(camera.zoom, RECOVERY_FOCUS_ZOOM)
    camera.updateProjectionMatrix()
    clampManualView()
    registerManualEnd()
    invalidate()
  })

  useEffect(() => {
    if (recoveryFocus) focusRecovery(recoveryFocus)
  }, [recoveryFocus])

  const recenter = useEffectEvent(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    pauseController.current.resume()
    reportPause(false)
    flushManualDamping()
    followCamera.current.reset()
    const target = followCamera.current.update(
      world,
      dwarves,
      size,
      performance.now(),
    )
    camera.position.x = target.center.x - world.width / 2
    camera.position.y = target.center.y - world.height / 2
    camera.zoom = target.zoom
    clampManualView()
    camera.updateProjectionMatrix()
    invalidate()
  })

  useEffect(() => {
    if (recenterRequest > 0) recenter()
  }, [recenterRequest])

  return (
    <>
      <group position={[-world.width / 2, -world.height / 2, 0]}>
        <TerrainLayer world={world} />
        <MiningLayer world={world} dwarves={dwarves} upgrades={upgrades} />
        <BuildingLayer world={world} constructionOrders={constructionOrders} />
        <DwarfLayer
          dwarves={dwarves}
          upgrades={upgrades}
          speed={speed}
          paused={paused}
        />
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
        minZoom={minZoom}
        maxZoom={maxZoom}
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
  const [recenterRequest, setRecenterRequest] = useState(0)
  return (
    <>
      <button
        type="button"
        className="camera-recenter"
        onClick={() => setRecenterRequest((count) => count + 1)}
        title="Center on colony activity"
      >
        Recenter
      </button>
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
          <WorldScene {...props} recenterRequest={recenterRequest} />
        </Canvas>
      </div>
    </>
  )
}

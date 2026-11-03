import { useFrame, useThree } from '@react-three/fiber'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { DoubleSide, type Group, type Texture } from 'three'
import { SIMULATION_TICK_MS } from '../game/state'
import type { DwarfState, UpgradeLevels } from '../game/types'
import {
  type DwarfTrack,
  isAnyTrackMoving,
  isTrackMoving,
  nextTracks,
  snapDistanceFor,
  trackPosition,
} from './dwarfInterpolation'
import {
  type DwarfPose,
  dwarfFrameFor,
  dwarfFrameOffset,
  dwarfFrameSlot,
  dwarfIndicatorFor,
  dwarfPoseFor,
} from './dwarfSprite'
import {
  createDwarfSpriteTexture,
  DWARF_PLANE_SIZE,
  DWARF_SPRITE_CENTER_Y,
} from './dwarfTexture'

const DWARF_COLORS = [
  '#e3b96f',
  '#81b2a3',
  '#c47768',
  '#b19ad2',
  '#d8d18a',
  '#8daac5',
]

/** Group z, above terrain (0) and buildings (0.5). */
const DWARF_Z = 1

/** Per-dwarf animation offset, so a crowd does not march in lockstep. */
const FRAME_PHASE_STEP_MS = 73

type DwarfLayerProps = {
  dwarves: DwarfState[]
  upgrades: UpgradeLevels
  speed: number
  paused: boolean
}

/** Everything the render loop needs to pose one dwarf, without React state. */
type DwarfVisual = {
  group: Group
  texture: Texture
  /** Sheet slot currently showing, so a frame only redraws when it changes. */
  slot: number
  facing: 1 | -1
  lastX: number
}

type DwarfActorProps = {
  id: string
  color: string
  register: (
    id: string,
    visual: { group: Group; texture: Texture } | null,
  ) => void
}

/**
 * One dwarf: a single quad showing one frame of the generated sprite sheet.
 * Position, facing and frame are driven imperatively by the layer's render
 * loop, so a simulation tick does not have to re-render (or re-mount) it.
 */
const DwarfActor = memo(function DwarfActor({
  id,
  color,
  register,
}: DwarfActorProps) {
  const texture = useMemo(() => createDwarfSpriteTexture(color), [color])
  useEffect(() => () => texture.dispose(), [texture])

  const attach = useCallback(
    (group: Group | null) => {
      register(id, group ? { group, texture } : null)
      return () => register(id, null)
    },
    [id, register, texture],
  )

  return (
    <group ref={attach}>
      <mesh position={[0, DWARF_SPRITE_CENTER_Y, 0]}>
        <planeGeometry args={[DWARF_PLANE_SIZE[0], DWARF_PLANE_SIZE[1]]} />
        {/* alphaTest keeps the cut-out sprite in the opaque pass, so
            overlapping dwarves sort with the depth buffer instead of
            flickering against each other. */}
        <meshBasicMaterial
          map={texture}
          alphaTest={0.5}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
})

/** Picks the pose for a dwarf from its task and whether it is mid-stride. */
function poseFor(dwarf: DwarfState, moving: boolean): DwarfPose {
  return dwarfPoseFor({
    taskKind: dwarf.task.kind,
    carrying: dwarf.carrying !== null,
    moving,
  })
}

function indicatorFor(dwarf: DwarfState) {
  return dwarfIndicatorFor({
    isRecovery:
      dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded',
    isWorking: dwarf.task.kind !== 'idle',
  })
}

/**
 * Draws dwarves and glides them between simulation ticks. The simulation is
 * 10 Hz; without interpolation the dwarves would jump a tile every 100 ms.
 * Each tick starts a new segment on the track, and every rendered frame
 * samples it, asking for another frame while anyone is still walking or a
 * sprite frame changed. Demand rendering then stops by itself once all
 * dwarves have arrived and the sprites are at rest.
 */
export default function DwarfLayer({
  dwarves,
  upgrades,
  speed,
  paused,
}: DwarfLayerProps) {
  const invalidate = useThree((state) => state.invalidate)
  const tracks = useRef<Map<string, DwarfTrack>>(new Map())
  const visuals = useRef<Map<string, DwarfVisual>>(new Map())
  // Animation clock in ms. It only advances while the simulation runs, so a
  // paused colony shows a frozen pose instead of breathing in place.
  const clock = useRef(0)

  const register = useCallback(
    (id: string, visual: { group: Group; texture: Texture } | null) => {
      if (!visual) {
        visuals.current.delete(id)
        return
      }
      const existing = visuals.current.get(id)
      visuals.current.set(id, {
        group: visual.group,
        texture: visual.texture,
        slot: existing?.slot ?? -1,
        facing: existing?.facing ?? 1,
        lastX: existing?.lastX ?? Number.NaN,
      })
      const track = tracks.current.get(id)
      if (track) {
        const position = trackPosition(track, performance.now())
        visual.group.position.set(position.x + 0.5, position.y + 0.5, DWARF_Z)
      }
    },
    [],
  )

  // A tick landed: start a new segment per dwarf from where it was heading.
  useLayoutEffect(() => {
    const now = performance.now()
    tracks.current = nextTracks(
      tracks.current,
      dwarves,
      now,
      SIMULATION_TICK_MS,
      snapDistanceFor(upgrades, speed),
    )
    for (const dwarf of dwarves) {
      const track = tracks.current.get(dwarf.id)
      const visual = visuals.current.get(dwarf.id)
      if (!track || !visual) continue
      const position = trackPosition(track, now)
      visual.group.position.set(position.x + 0.5, position.y + 0.5, DWARF_Z)
      visual.lastX = position.x
      // A dwarf that just got a new target turns towards it, so the pickaxe
      // swings at the block it is actually mining.
      const target = dwarf.task.target
      if (target && target.x !== dwarf.position.x) {
        visual.facing = target.x < dwarf.position.x ? -1 : 1
        visual.group.scale.x = visual.facing
      }
    }
    // Dwarves can change while paused (save import, new run), so the new
    // positions have to reach the screen even though no tick will ask for one.
    if (paused) invalidate()
  }, [dwarves, upgrades, speed, invalidate, paused])

  useFrame((_, delta) => {
    // Paused means static: keep the last rendered pose and request no frames.
    if (paused) return
    clock.current += delta * 1000
    const now = performance.now()
    let awake = false

    dwarves.forEach((dwarf, index) => {
      const visual = visuals.current.get(dwarf.id)
      if (!visual) return
      const track = tracks.current.get(dwarf.id)
      const moving = track ? isTrackMoving(track, now) : false
      const position = track ? trackPosition(track, now) : dwarf.position
      if (moving) awake = true

      // Face the direction of travel.
      const dx = position.x - visual.lastX
      if (Math.abs(dx) > 1e-4) {
        visual.facing = dx > 0 ? 1 : -1
        visual.group.scale.x = visual.facing
        visual.lastX = position.x
      }

      visual.group.position.set(position.x + 0.5, position.y + 0.5, DWARF_Z)

      const pose = poseFor(dwarf, moving)
      const frame = dwarfFrameFor(
        pose,
        clock.current + index * FRAME_PHASE_STEP_MS,
      )
      const slot = dwarfFrameSlot(pose, frame, indicatorFor(dwarf))
      if (slot !== visual.slot) {
        visual.slot = slot
        visual.texture.offset.x = dwarfFrameOffset(slot)
        awake = true
      }
    })

    // Keep demand rendering awake while anyone is mid-interpolation or a
    // sprite frame changed, and let it fall asleep on the frame where the
    // last dwarf arrives and the last frame is drawn.
    if (awake || isAnyTrackMoving(tracks.current.values(), now)) invalidate()
  })

  return (
    <group>
      {dwarves.map((dwarf, index) => (
        <DwarfActor
          key={dwarf.id}
          id={dwarf.id}
          color={DWARF_COLORS[index % DWARF_COLORS.length]}
          register={register}
        />
      ))}
    </group>
  )
}

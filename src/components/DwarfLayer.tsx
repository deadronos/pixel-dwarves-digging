import { useFrame, useThree } from '@react-three/fiber'
import { memo, useCallback, useLayoutEffect, useRef } from 'react'
import type { Group } from 'three'
import { SIMULATION_TICK_MS } from '../game/state'
import type { DwarfState } from '../game/types'
import {
  type DwarfTrack,
  isAnyTrackMoving,
  nextTracks,
  snapDistanceForSpeed,
  trackPosition,
} from './dwarfInterpolation'

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

type DwarfLayerProps = {
  dwarves: DwarfState[]
  speed: number
  paused: boolean
}

function placeGroup(group: Group, position: { x: number; y: number }): void {
  group.position.set(position.x + 0.5, position.y + 0.5, DWARF_Z)
}

type DwarfActorProps = {
  id: string
  index: number
  isWorking: boolean
  isRecovery: boolean
  register: (id: string, group: Group | null) => void
}

/**
 * Renders the bricks of one dwarf. Position is deliberately not a prop: the
 * layer drives it through the registered group ref so a simulation tick does
 * not have to re-render, or re-mount, the meshes to move them.
 *
 * `memo` keeps this out of the per-tick React work as long as only the
 * dwarf's tile changed.
 */
const DwarfActor = memo(function DwarfActor({
  id,
  index,
  isWorking,
  isRecovery,
  register,
}: DwarfActorProps) {
  const group = useRef<Group>(null)

  useLayoutEffect(() => {
    register(id, group.current)
    return () => register(id, null)
  }, [id, register])

  const color = DWARF_COLORS[index % DWARF_COLORS.length]

  return (
    <group ref={group}>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.5, 0.42, 0.12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <boxGeometry args={[0.36, 0.25, 0.12]} />
        <meshBasicMaterial color="#f0d5a0" />
      </mesh>
      {isRecovery ? (
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.12]} />
          <meshBasicMaterial color="#cf6f68" />
        </mesh>
      ) : isWorking ? (
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[0.14, 0.14, 0.12]} />
          <meshBasicMaterial color="#dfbd62" />
        </mesh>
      ) : null}
    </group>
  )
})

/**
 * Draws dwarves and glides them between simulation ticks. The simulation is
 * 10 Hz; without interpolation the dwarves would jump a tile every 100 ms.
 * Each tick starts a new segment on the track, and every rendered frame
 * samples it, asking for another frame while anyone is still walking. Demand
 * rendering then stops by itself once all dwarves have arrived.
 */
export default function DwarfLayer({
  dwarves,
  speed,
  paused,
}: DwarfLayerProps) {
  const invalidate = useThree((state) => state.invalidate)
  const tracks = useRef<Map<string, DwarfTrack>>(new Map())
  const groups = useRef<Map<string, Group>>(new Map())

  const register = useCallback((id: string, group: Group | null) => {
    if (!group) {
      groups.current.delete(id)
      return
    }
    groups.current.set(id, group)
    const track = tracks.current.get(id)
    if (track) placeGroup(group, trackPosition(track, performance.now()))
  }, [])

  // A tick landed: start a new segment per dwarf from where it was heading.
  useLayoutEffect(() => {
    const now = performance.now()
    tracks.current = nextTracks(
      tracks.current,
      dwarves,
      now,
      SIMULATION_TICK_MS,
      snapDistanceForSpeed(speed),
    )
    for (const [id, track] of tracks.current) {
      const group = groups.current.get(id)
      if (group) placeGroup(group, trackPosition(track, now))
    }
    // Dwarves can change while paused (save import, new run), so the new
    // positions have to reach the screen even though no tick will ask for one.
    if (paused) invalidate()
  }, [dwarves, speed, invalidate, paused])

  useFrame(() => {
    // Paused means static: keep the last rendered pose and request no frames.
    if (paused) return
    const now = performance.now()
    for (const [id, track] of tracks.current) {
      const group = groups.current.get(id)
      if (group) placeGroup(group, trackPosition(track, now))
    }
    // Keep demand rendering awake while anyone is mid-interpolation, and let
    // it fall asleep on the frame where the last dwarf arrives.
    if (isAnyTrackMoving(tracks.current.values(), now)) invalidate()
  })

  return (
    <group>
      {dwarves.map((dwarf, index) => (
        <DwarfActor
          key={dwarf.id}
          id={dwarf.id}
          index={index}
          isWorking={dwarf.task.kind !== 'idle'}
          isRecovery={
            dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded'
          }
          register={register}
        />
      ))}
    </group>
  )
}

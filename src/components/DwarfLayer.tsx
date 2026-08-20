import type { DwarfState } from '../game/types'

const DWARF_COLORS = [
  '#e3b96f',
  '#81b2a3',
  '#c47768',
  '#b19ad2',
  '#d8d18a',
  '#8daac5',
]

type DwarfLayerProps = {
  dwarves: DwarfState[]
}

function DwarfActor({ dwarf, index }: { dwarf: DwarfState; index: number }) {
  const color = DWARF_COLORS[index % DWARF_COLORS.length]
  const isWorking = dwarf.task.kind !== 'idle'
  const isRecovery =
    dwarf.task.purpose === 'recovery' || dwarf.movement === 'stranded'

  return (
    <group position={[dwarf.position.x + 0.5, dwarf.position.y + 0.5, 1]}>
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
}

export default function DwarfLayer({ dwarves }: DwarfLayerProps) {
  return (
    <group>
      {dwarves.map((dwarf, index) => (
        <DwarfActor key={dwarf.id} dwarf={dwarf} index={index} />
      ))}
    </group>
  )
}

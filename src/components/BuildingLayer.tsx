import { memo } from 'react'
import type { BuildingState, World } from '../game/types'

const BUILDING_COLORS: Record<BuildingState['type'], string> = {
  stockpile: '#b89d64',
  outpost: '#75b7ae',
  bridge: '#a27b53',
  ladder: '#dfbd62',
}

function BuildingMesh({ building }: { building: BuildingState }) {
  const isComplete = building.construction === 'completed'
  const color = BUILDING_COLORS[building.type]
  const depth = building.type === 'ladder' ? 0.12 : 0.26
  const stored = Object.values(building.storage?.inventory ?? {}).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  )
  const fill = building.storage
    ? Math.min(1, stored / Math.max(1, building.storage.capacity))
    : 0

  return (
    <group
      position={[
        building.position.x + building.width / 2,
        building.position.y + building.height / 2,
        building.type === 'ladder' ? 0.5 : 0.55,
      ]}
    >
      <mesh>
        <boxGeometry
          args={[building.width * 0.92, building.height * 0.82, depth]}
        />
        <meshBasicMaterial
          color={color}
          transparent={!isComplete}
          opacity={isComplete ? 0.9 : 0.45}
        />
      </mesh>
      {building.type === 'stockpile' ? (
        <mesh position={[0, building.height * 0.22, 0.08]}>
          <boxGeometry args={[building.width * 0.5, 0.12, 0.08]} />
          <meshBasicMaterial color="#f1e7c8" />
        </mesh>
      ) : null}
      {building.storage ? (
        <mesh position={[0, -building.height * 0.42, 0.1]}>
          <boxGeometry args={[building.width * 0.74 * fill, 0.08, 0.08]} />
          <meshBasicMaterial color="#f1e7c8" />
        </mesh>
      ) : null}
    </group>
  )
}

const BuildingLayer = memo(function BuildingLayer({ world }: { world: World }) {
  return (
    <group>
      {world.buildings.map((building) => (
        <BuildingMesh key={building.id} building={building} />
      ))}
    </group>
  )
})

export default BuildingLayer

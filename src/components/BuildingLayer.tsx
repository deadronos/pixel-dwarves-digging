import { memo, useMemo } from 'react'
import { BUILDING_COLORS } from '../game/content'
import type { BuildingState, ConstructionOrder, World } from '../game/types'
import {
  constructionProgressByBuilding,
  type ScaffoldState,
} from './buildingScaffold'
import { scaffoldTextureFor } from './buildingTexture'

/** Finished buildings draw a box; unfinished ones draw a scaffold. */
function buildingZ(building: BuildingState): number {
  return building.type === 'ladder' ? 0.5 : 0.55
}

const CompletedMesh = memo(function CompletedMesh({
  building,
}: {
  building: BuildingState
}) {
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
    <>
      <mesh>
        <boxGeometry
          args={[building.width * 0.92, building.height * 0.82, depth]}
        />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
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
    </>
  )
})

/**
 * A planned or under-construction site: a dashed footprint outline (plus a
 * brace hatch once work has started) and a bottom-up fill showing how much of
 * the required material has arrived.
 */
const SiteMesh = memo(function SiteMesh({
  building,
  progress,
}: {
  building: BuildingState
  progress: number
}) {
  const color = BUILDING_COLORS[building.type]
  const state: ScaffoldState =
    building.construction === 'planned' ? 'planned' : 'under-construction'
  const texture = useMemo(
    () => scaffoldTextureFor(building.width, building.height, color, state),
    [building.width, building.height, color, state],
  )

  const inner = 0.94
  const fillHeight = building.height * inner * progress

  return (
    <>
      <mesh>
        <planeGeometry
          args={[building.width * inner, building.height * inner]}
        />
        <meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} />
      </mesh>
      {progress > 0 ? (
        <>
          {/* Delivered material, filled up from the floor of the site. */}
          <mesh
            position={[
              0,
              -building.height * inner * 0.5 + fillHeight * 0.5,
              0.01,
            ]}
          >
            <planeGeometry
              args={[building.width * inner * 0.82, Math.max(0.04, fillHeight)]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.42}
              toneMapped={false}
            />
          </mesh>
          {/* Bright lip on top of the fill so the progress edge is readable. */}
          <mesh
            position={[0, -building.height * inner * 0.5 + fillHeight, 0.02]}
          >
            <planeGeometry args={[building.width * inner * 0.82, 0.06]} />
            <meshBasicMaterial color="#f1e7c8" toneMapped={false} />
          </mesh>
        </>
      ) : null}
      {state === 'planned' ? (
        // A planned site gets a faint interior so the footprint is visible
        // against dark terrain without looking like a finished building.
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry
            args={[building.width * inner, building.height * inner]}
          />
          <meshBasicMaterial color={color} transparent opacity={0.1} />
        </mesh>
      ) : null}
    </>
  )
})

const BuildingMesh = memo(function BuildingMesh({
  building,
  progress,
}: {
  building: BuildingState
  progress: number
}) {
  return (
    <group
      position={[
        building.position.x + building.width / 2,
        building.position.y + building.height / 2,
        buildingZ(building),
      ]}
    >
      {building.construction === 'completed' ? (
        <CompletedMesh building={building} />
      ) : (
        <SiteMesh building={building} progress={progress} />
      )}
    </group>
  )
})

const BuildingLayer = memo(function BuildingLayer({
  world,
  constructionOrders = [],
}: {
  world: World
  constructionOrders?: ConstructionOrder[]
}) {
  const progressByBuilding = useMemo(
    () => constructionProgressByBuilding(constructionOrders),
    [constructionOrders],
  )

  return (
    <group>
      {world.buildings.map((building) => (
        <BuildingMesh
          key={building.id}
          building={building}
          progress={progressByBuilding.get(building.id) ?? 0}
        />
      ))}
    </group>
  )
})

export default BuildingLayer

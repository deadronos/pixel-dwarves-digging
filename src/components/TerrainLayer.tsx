import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh } from 'three'
import { Matrix4 } from 'three'
import { BLOCK_COLORS } from '../game/content'
import type { Cell, World } from '../game/types'
import {
  createTerrainPositions,
  RENDERED_BLOCKS,
  type RenderedBlockType,
  type TerrainPositions,
  updateTerrainPositions,
} from './terrainPositions'

type TerrainLayerProps = {
  world: World
}

const BlockInstances = memo(function BlockInstances({
  positions,
  block,
}: {
  positions: TerrainPositions
  block: RenderedBlockType
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const matrix = useMemo(() => new Matrix4(), [])
  const blockPositions = positions.get(block) ?? []

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    blockPositions.forEach(([x, y], index) => {
      matrix.makeTranslation(x + 0.5, y + 0.5, 0)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [blockPositions, matrix])

  if (blockPositions.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, blockPositions.length]}
    >
      <boxGeometry args={[0.96, 0.96, 0.18]} />
      <meshBasicMaterial color={BLOCK_COLORS[block]} />
    </instancedMesh>
  )
})

const TerrainLayer = memo(function TerrainLayer({ world }: TerrainLayerProps) {
  const positionCache = useRef<{
    cells: Cell[]
    width: number
    positions: TerrainPositions
  } | null>(null)
  const positions = useMemo(() => {
    const previous = positionCache.current
    const next =
      previous?.width === world.width
        ? updateTerrainPositions(
            previous.positions,
            previous.cells,
            world.cells,
            world.width,
          )
        : createTerrainPositions(world.cells, world.width)
    positionCache.current = {
      cells: world.cells,
      width: world.width,
      positions: next,
    }
    return next
  }, [world.cells, world.width])

  return (
    <group>
      {RENDERED_BLOCKS.map((block) => (
        <BlockInstances
          key={`${block}-${positions.get(block)?.length ?? 0}`}
          positions={positions}
          block={block}
        />
      ))}
      <mesh
        position={[world.width / 2, world.height / 2, -0.2]}
        scale={[world.width, world.height, 1]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#20251f" />
      </mesh>
    </group>
  )
})

export default TerrainLayer

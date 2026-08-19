import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh } from 'three'
import { Matrix4 } from 'three'
import { BLOCK_COLORS, MINEABLE_BLOCKS } from '../game/content'
import type { World } from '../game/types'

type TerrainLayerProps = {
  world: World
}

const BlockInstances = memo(function BlockInstances({
  world,
  block,
}: {
  world: World
  block: (typeof MINEABLE_BLOCKS)[number]
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const matrix = useMemo(() => new Matrix4(), [])
  const positions = useMemo(
    () =>
      world.cells.reduce<Array<[number, number]>>((result, cell, index) => {
        if (cell.block === block) {
          result.push([index % world.width, Math.floor(index / world.width)])
        }
        return result
      }, []),
    [block, world.cells, world.width],
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    positions.forEach(([x, y], index) => {
      matrix.makeTranslation(x + 0.5, y + 0.5, 0)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [matrix, positions])

  if (positions.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.96, 0.96, 0.18]} />
      <meshBasicMaterial color={BLOCK_COLORS[block]} />
    </instancedMesh>
  )
})

const TerrainLayer = memo(function TerrainLayer({ world }: TerrainLayerProps) {
  return (
    <group>
      {MINEABLE_BLOCKS.map((block) => (
        <BlockInstances key={block} world={world} block={block} />
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

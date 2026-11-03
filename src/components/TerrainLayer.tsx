import { useThree } from '@react-three/fiber'
import { memo, useEffect, useLayoutEffect, useMemo } from 'react'
import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import type { World } from '../game/types'
import { TERRAIN_TEXELS_PER_CELL } from './terrainShading'
import { fillTerrainTexels, terrainBufferLength } from './terrainTexture'

type TerrainLayerProps = {
  world: World
}

function createTerrainTexture(width: number, height: number): DataTexture {
  const texture = new DataTexture(
    new Uint8Array(terrainBufferLength(width, height)),
    width * TERRAIN_TEXELS_PER_CELL,
    height * TERRAIN_TEXELS_PER_CELL,
    RGBAFormat,
    UnsignedByteType,
  )
  // One crisp texel per cell: no filtering, no mipmaps. The bytes are sRGB
  // palette colours, so tag them as such to match the previous colour output.
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * The whole terrain is one world-sized quad sampling a supersampled texture
 * (a few texels per cell, so exposed edges can be lit). The texture is
 * allocated once per world size; each cell change rewrites the texels in
 * place, so there are no per-block meshes to remount.
 */
const TerrainLayer = memo(function TerrainLayer({ world }: TerrainLayerProps) {
  const invalidate = useThree((state) => state.invalidate)
  const { width, height } = world
  const texture = useMemo(
    () => createTerrainTexture(width, height),
    [width, height],
  )

  useEffect(() => () => texture.dispose(), [texture])

  useLayoutEffect(() => {
    fillTerrainTexels(world, texture.image.data as Uint8Array)
    texture.needsUpdate = true
    // Texels are written directly, so demand rendering needs an explicit
    // invalidation to pick up mined and generated blocks.
    invalidate()
  }, [world, texture, invalidate])

  // z = 0 keeps the terrain beneath buildings (z >= 0.5) and dwarves (z = 1).
  return (
    <mesh position={[width / 2, height / 2, 0]} scale={[width, height, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  )
})

export default TerrainLayer

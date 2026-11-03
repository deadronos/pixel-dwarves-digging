import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { type ScaffoldState, scaffoldPixels } from './buildingScaffold'

/**
 * Scaffold textures are shared per (type size, colour, state): a site only
 * ever shows one of a handful of footprints, and the art never changes while
 * the app runs, so a small cache avoids re-uploading a texture per tick.
 */
const cache = new Map<string, DataTexture>()

function createScaffoldTexture(
  widthCells: number,
  heightCells: number,
  color: string,
  state: ScaffoldState,
): DataTexture {
  const { width, height, data } = scaffoldPixels(
    widthCells,
    heightCells,
    color,
    state,
  )
  const texture = new DataTexture(
    data,
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  // The art is authored top row first; DataTexture uploads bottom row first.
  texture.flipY = true
  // `DataTexture` never marks itself dirty, so without this it never uploads.
  texture.needsUpdate = true
  return texture
}

/** Cached scaffold texture for a footprint. */
export function scaffoldTextureFor(
  widthCells: number,
  heightCells: number,
  color: string,
  state: ScaffoldState,
): DataTexture {
  const key = `${widthCells}x${heightCells}:${color}:${state}`
  const cached = cache.get(key)
  if (cached) return cached
  const texture = createScaffoldTexture(widthCells, heightCells, color, state)
  cache.set(key, texture)
  return texture
}

/** Drops every cached texture. Only used by tests. */
export function clearScaffoldTextureCache(): void {
  for (const texture of cache.values()) texture.dispose()
  cache.clear()
}

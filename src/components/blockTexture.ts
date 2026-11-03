import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import {
  BLOCK_CHIP_SIZE,
  CRACK_FRAME_HEIGHT,
  CRACK_FRAME_WIDTH,
  CRACK_STAGES,
  createBlockChip,
  createCrackAtlas,
} from './blockArt'

/**
 * `DataTexture` wrappers for the mining overlays. One texture per overlay
 * instance (not shared) because the frame is chosen by mutating the texture
 * offset, and two cracks at different stages must not fight over it.
 */

function baseTexture(
  data: Uint8Array,
  width: number,
  height: number,
): DataTexture {
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

/** Crack sheet for one block colour, showing the first stage. */
export function createCrackTexture(blockColor: string): DataTexture {
  const texture = baseTexture(
    createCrackAtlas(blockColor),
    CRACK_STAGES * CRACK_FRAME_WIDTH,
    CRACK_FRAME_HEIGHT,
  )
  texture.repeat.set(1 / CRACK_STAGES, 1)
  texture.offset.set(0, 0)
  return texture
}

/** Slides the crack sheet to `stage` (0..CRACK_STAGES-1). */
export function setCrackStage(texture: DataTexture, stage: number): void {
  const clamped = Math.max(0, Math.min(CRACK_STAGES - 1, Math.floor(stage)))
  texture.offset.x = clamped / CRACK_STAGES
}

/** Height of the carried chip above the dwarf's feet, in cells. */
export const BLOCK_CHIP_HEIGHT = 1.5

/** World-space size of the carried chip, in cells. */
export const BLOCK_CHIP_PLANE_SIZE = 0.55

/** Bevelled chip of one block colour, for the block a dwarf is carrying. */
export function createBlockChipTexture(blockColor: string): DataTexture {
  return baseTexture(
    createBlockChip(blockColor),
    BLOCK_CHIP_SIZE,
    BLOCK_CHIP_SIZE,
  )
}

import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import {
  createDwarfAtlas,
  DWARF_ATLAS_FRAMES,
  DWARF_ATLAS_HEIGHT,
  DWARF_ATLAS_WIDTH,
  DWARF_SPRITE_HEIGHT,
  DWARF_SPRITE_WIDTH,
  dwarfFrameOffset,
  dwarfFrameSlot,
} from './dwarfSprite'

/** Centre of the sprite above the dwarf's cell, so its feet sit on the floor. */
export const DWARF_SPRITE_CENTER_Y = DWARF_SPRITE_HEIGHT / 2 - 0.5

/**
 * The frame the plane shows is chosen by sliding the texture window along the
 * sheet, so one texture (and one mesh) covers every pose, indicator and
 * frame of a dwarf.
 */
export function createDwarfSpriteTexture(bodyColor: string): DataTexture {
  const texture = new DataTexture(
    createDwarfAtlas(bodyColor),
    DWARF_ATLAS_WIDTH,
    DWARF_ATLAS_HEIGHT,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = SRGBColorSpace
  // The sheet is authored top row first; DataTexture uploads bottom row first.
  texture.flipY = true
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.repeat.set(1 / DWARF_ATLAS_FRAMES, 1)
  texture.offset.set(dwarfFrameOffset(dwarfFrameSlot('idle', 0, 'none')), 0)
  // `DataTexture` does not mark itself dirty, and the renderer only uploads a
  // texture whose version has advanced. Without this the sheet never reaches
  // the GPU and every dwarf is an invisible quad.
  texture.needsUpdate = true
  return texture
}

/** Sprite plane size in world cells. */
export const DWARF_PLANE_SIZE: readonly [number, number] = [
  DWARF_SPRITE_WIDTH,
  DWARF_SPRITE_HEIGHT,
]

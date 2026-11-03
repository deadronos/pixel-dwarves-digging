import { mixRgb, type Rgb } from './colorMath'

/**
 * Shading maths for the terrain texture: how much a block darkens with depth,
 * what air looks like above the surface versus inside a tunnel, and how an
 * air-facing edge is lit.
 *
 * Everything is pure sRGB byte maths so the terrain texture can call it per
 * texel without allocating, and so the palette guard in `palette.test.ts` can
 * check the shaded extremes with exactly the same functions the renderer uses.
 */

/** Texels per cell on each axis. Gives room for a one-texel lit edge. */
export const TERRAIN_TEXELS_PER_CELL = 3

/** Cells below the local surface at which depth shading stops growing. */
export const DEPTH_SATURATION_CELLS = 42

/**
 * Brightness removed at maximum depth.
 *
 * Every solid block is shaded by the same factor at the same depth on
 * purpose: a uniform multiplicative shade keeps the *relative* contrast
 * between blocks (and between a mineral and the rock around it) intact, and
 * `palette.test.ts` checks that the shaded extremes have not been pushed
 * together by more than this factor allows.
 */
export const DEPTH_DARKEN = 0.3

/** Tunnel air darkens a little faster than rock: it reads as an unlit pocket. */
export const TUNNEL_DARKEN = 0.34

/** Lit edge on top of a block that faces air. */
export const EDGE_TOP_LIGHTEN = 0.14

/** Lit edge on the side of a block that faces air. */
export const EDGE_SIDE_LIGHTEN = 0.08

/** Air-facing underside: a soft shadow instead of a highlight. */
export const EDGE_BOTTOM_DARKEN = 0.12

/** Colour of open sky, near the surface and at the top of the map. */
export const SKY_NEAR_COLOR: Rgb = [35, 42, 35]
export const SKY_FAR_COLOR: Rgb = [22, 26, 28]

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Multiplicative brightness for a cell `depthCells` below its column's
 * surface. Uniform across blocks so relative contrast is preserved.
 */
export function depthFactorFor(depthCells: number): number {
  const t = clamp01(depthCells / DEPTH_SATURATION_CELLS)
  return 1 - DEPTH_DARKEN * t
}

/** A solid block colour shaded for its depth. */
export function shadeForDepth(rgb: Rgb, depthCells: number): Rgb {
  const factor = depthFactorFor(depthCells)
  if (factor >= 1) return rgb
  return [
    Math.round(rgb[0] * factor),
    Math.round(rgb[1] * factor),
    Math.round(rgb[2] * factor),
  ]
}

/**
 * Air colour for a cell `heightAboveSurface` rows above its column's surface.
 * 0 is right at the surface, 1 is the top of the map.
 */
export function skyColorFor(
  heightAboveSurface: number,
  skyHeight: number,
): Rgb {
  const t = skyHeight > 0 ? clamp01(heightAboveSurface / skyHeight) : 0
  return mixRgb(SKY_NEAR_COLOR, SKY_FAR_COLOR, t)
}

/** Air inside a tunnel, darkened with the depth of the pocket. */
export function tunnelAirFor(baseAir: Rgb, depthCells: number): Rgb {
  const t = clamp01(depthCells / DEPTH_SATURATION_CELLS)
  const factor = 1 - TUNNEL_DARKEN * t
  return [
    Math.round(baseAir[0] * factor),
    Math.round(baseAir[1] * factor),
    Math.round(baseAir[2] * factor),
  ]
}

/** Brighten a block edge that faces air. */
export function edgeLit(rgb: Rgb, side: 'top' | 'side'): Rgb {
  return mixRgb(
    rgb,
    [255, 255, 255],
    side === 'top' ? EDGE_TOP_LIGHTEN : EDGE_SIDE_LIGHTEN,
  )
}

/** Shadow under an air-facing underside. */
export function edgeShadowed(rgb: Rgb): Rgb {
  return mixRgb(rgb, [0, 0, 0], EDGE_BOTTOM_DARKEN)
}

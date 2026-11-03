/**
 * Small colour helpers shared by the procedural sprite and terrain textures.
 *
 * Everything here works on `#rrggbb` hex strings or raw sRGB bytes, because
 * the canvas is `flat`: what these functions produce is exactly what reaches
 * the screen. Blending happens in sRGB on purpose — it is the same space the
 * palette constants were tuned in, so a shaded colour stays visually "the
 * same colour, darker".
 */

export type Rgb = [number, number, number]

export function parseHexColor(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export function rgbToHex([r, g, b]: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** Multiplies every channel by `factor` (0 keeps black, 1 is unchanged). */
export function darkenRgb(rgb: Rgb, factor: number): Rgb {
  return [
    clampChannel(rgb[0] * factor),
    clampChannel(rgb[1] * factor),
    clampChannel(rgb[2] * factor),
  ]
}

export function darkenHex(hex: string, factor: number): string {
  return rgbToHex(darkenRgb(parseHexColor(hex), factor))
}

/** Linear blend: `amount` 0 returns `from`, 1 returns `to`. */
export function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount))
  return [
    clampChannel(from[0] + (to[0] - from[0]) * t),
    clampChannel(from[1] + (to[1] - from[1]) * t),
    clampChannel(from[2] + (to[2] - from[2]) * t),
  ]
}

export function mixHex(from: string, to: string, amount: number): string {
  return rgbToHex(mixRgb(parseHexColor(from), parseHexColor(to), amount))
}

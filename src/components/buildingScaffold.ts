import type { ConstructionOrder, Inventory } from '../game/types'

/**
 * Scaffold art for buildings that are not finished yet.
 *
 * A planned or under-construction building used to be drawn as the finished
 * box at 45% opacity, which read as "faded building" rather than "not built
 * yet". Instead it is drawn as a pixel-art scaffold: a dashed outline of the
 * footprint, diagonal braces once work has started, and a bottom-up progress
 * fill fed by the construction order's delivered materials.
 */

/** Scaffold texels per cell on each axis. */
export const SCAFFOLD_TEXELS_PER_CELL = 4

export type ScaffoldState = 'planned' | 'under-construction'

/** Dash pattern along the border, in texels. */
const DASH_ON = 2
const DASH_PERIOD = 4

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function scaleChannel(value: number, factor: number): number {
  return Math.max(0, Math.min(255, Math.round(value * factor)))
}

/**
 * RGBA pixels for one scaffold footprint, row 0 at the top. The border is a
 * dashed ring; an under-construction site also gets a diagonal brace hatch and
 * a brighter outline so the two states are told apart at a glance.
 */
export function scaffoldPixels(
  widthCells: number,
  heightCells: number,
  color: string,
  state: ScaffoldState,
): { width: number; height: number; data: Uint8Array } {
  const width = Math.max(1, widthCells) * SCAFFOLD_TEXELS_PER_CELL
  const height = Math.max(1, heightCells) * SCAFFOLD_TEXELS_PER_CELL
  const data = new Uint8Array(width * height * 4)

  const [r, g, b] = parseHex(color)
  const bright = state === 'under-construction' ? 1 : 0.72
  const border: [number, number, number] = [
    scaleChannel(r, bright),
    scaleChannel(g, bright),
    scaleChannel(b, bright),
  ]
  // Braces are deliberately dimmer than the outline so they read as a
  // scaffold behind the building rather than as another edge.
  const brace: [number, number, number] = [
    scaleChannel(r, 0.5),
    scaleChannel(g, 0.5),
    scaleChannel(b, 0.5),
  ]

  const put = (x: number, y: number, rgb: [number, number, number]) => {
    const offset = (y * width + x) * 4
    data[offset] = rgb[0]
    data[offset + 1] = rgb[1]
    data[offset + 2] = rgb[2]
    data[offset + 3] = 255
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (onBorder) {
        // Dashes run along each edge, measured from the corner they start at.
        const along = x === 0 || x === width - 1 ? y : x
        if (along % DASH_PERIOD < DASH_ON) put(x, y, border)
        continue
      }
      if (state !== 'under-construction') continue
      // Diagonal hatch: two families of lines crossing into a lattice.
      const down = (x + y) % (SCAFFOLD_TEXELS_PER_CELL * 2) === 0
      const up = (x - y + width * 2) % (SCAFFOLD_TEXELS_PER_CELL * 2) === 0
      if (down || up) put(x, y, brace)
    }
  }

  return { width, height, data }
}

/**
 * How far along a construction order is, as a 0..1 ratio of delivered to
 * required material. Orders with nothing required count as complete.
 */
export function constructionProgress(
  order: Pick<ConstructionOrder, 'required' | 'delivered'> | null | undefined,
): number {
  if (!order) return 0
  let required = 0
  let delivered = 0
  for (const [material, amount] of Object.entries(order.required)) {
    required += amount ?? 0
    delivered += order.delivered[material as keyof Inventory] ?? 0
  }
  if (required <= 0) return 1
  return Math.max(0, Math.min(1, delivered / required))
}

/**
 * Progress per building id, so `BuildingLayer` can look up the site it is
 * drawing without scanning the order list for every building.
 */
export function constructionProgressByBuilding(
  orders: readonly ConstructionOrder[],
): Map<string, number> {
  const progress = new Map<string, number>()
  for (const order of orders) {
    const value = constructionProgress(order)
    const existing = progress.get(order.buildingId)
    if (existing === undefined || value > existing) {
      progress.set(order.buildingId, value)
    }
  }
  return progress
}

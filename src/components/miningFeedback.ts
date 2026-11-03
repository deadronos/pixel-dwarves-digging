import { blockAt } from '../game/blocks'
import { DIG_DURATION } from '../game/content'
import type {
  BlockType,
  DwarfState,
  MineableBlockType,
  World,
} from '../game/types'
import { crackStageFor } from './blockArt'

/**
 * Pure helpers for the mining feedback overlays: how far along a dig is, and
 * which blocks currently need a crack drawn on them. Kept out of the R3F
 * layer so the numbers can be unit tested.
 */

/** Progress of a dig task as a 0..1 ratio, matching `advanceDig`'s duration. */
export function digProgressRatio(
  progress: number,
  block: BlockType,
  toolPower: number,
): number {
  const duration = Math.max(1, DIG_DURATION[block] - toolPower * 2)
  if (!(progress > 0)) return 0
  return Math.min(1, progress / duration)
}

export type DigOverlay = {
  /** Stable key: one crack per dwarf target. */
  key: string
  x: number
  y: number
  block: MineableBlockType
  /** 0..1 dig progress. */
  ratio: number
  /** Crack frame to draw, 0..CRACK_STAGES-1. */
  stage: number
}

/**
 * The crack overlays to draw for the current tick: one per dwarf that is
 * actively digging a real block. Two dwarves on the same block share the
 * deepest crack instead of drawing two.
 */
export function collectDigOverlays(
  world: World,
  dwarves: readonly DwarfState[],
  toolPower: number,
): DigOverlay[] {
  const byCell = new Map<string, DigOverlay>()
  for (const dwarf of dwarves) {
    const task = dwarf.task
    if (task.kind !== 'dig' || !task.target) continue
    const block = blockAt(world, task.target.y * world.width + task.target.x)
    if (block === 'air' || block === 'bedrock') continue
    const ratio = digProgressRatio(task.progress, block, toolPower)
    const key = `${task.target.x},${task.target.y}`
    const existing = byCell.get(key)
    if (existing && existing.ratio >= ratio) continue
    byCell.set(key, {
      key,
      x: task.target.x,
      y: task.target.y,
      block,
      ratio,
      stage: crackStageFor(ratio),
    })
  }
  return [...byCell.values()]
}

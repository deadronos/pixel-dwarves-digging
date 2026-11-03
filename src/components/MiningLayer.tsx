import { memo, useEffect, useLayoutEffect, useMemo } from 'react'
import { BLOCK_COLORS } from '../game/content'
import type { DwarfState, UpgradeLevels, World } from '../game/types'
import { createCrackTexture, setCrackStage } from './blockTexture'
import { collectDigOverlays, type DigOverlay } from './miningFeedback'

/** Between the terrain (z = 0) and buildings (z = 0.5). */
const CRACK_Z = 0.4

type CrackProps = {
  overlay: DigOverlay
}

/**
 * The crack on one block being mined. The texture is a per-block-colour sheet
 * of crack stages; the stage is picked by sliding the texture window, so a
 * tick's extra progress costs one offset write and no re-upload.
 */
const Crack = memo(function Crack({ overlay }: CrackProps) {
  const texture = useMemo(
    () => createCrackTexture(BLOCK_COLORS[overlay.block]),
    [overlay.block],
  )

  useEffect(() => () => texture.dispose(), [texture])

  useLayoutEffect(() => {
    setCrackStage(texture, overlay.stage)
  }, [texture, overlay.stage])

  return (
    <mesh position={[overlay.x + 0.5, overlay.y + 0.5, CRACK_Z]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} />
    </mesh>
  )
})

/**
 * Draws the digging progress on the blocks dwarves are working on. It is one
 * cut-out quad per active dig — never one per block — and it re-renders only
 * when the simulation tick changes the diggers, their targets or progress.
 */
const MiningLayer = memo(function MiningLayer({
  world,
  dwarves,
  upgrades,
}: {
  world: World
  dwarves: DwarfState[]
  upgrades: UpgradeLevels
}) {
  const overlays = useMemo(
    () => collectDigOverlays(world, dwarves, upgrades.toolPower),
    [world, dwarves, upgrades.toolPower],
  )

  return (
    <group>
      {overlays.map((overlay) => (
        <Crack key={overlay.key} overlay={overlay} />
      ))}
    </group>
  )
})

export default MiningLayer

import { expect, test } from '@playwright/test'

async function centeredRecoveryPixels(page, terrain) {
  const png = (await terrain.screenshot()).toString('base64')
  return page.evaluate(async (image) => {
    const response = await fetch(`data:image/png;base64,${image}`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    const radius = 32
    const pixels = context.getImageData(
      Math.floor(canvas.width / 2) - radius,
      Math.floor(canvas.height / 2) - radius,
      radius * 2,
      radius * 2,
    ).data
    bitmap.close()

    let matches = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index] >= 250 &&
        Math.abs(pixels[index + 1] - 209) <= 3 &&
        Math.abs(pixels[index + 2] - 120) <= 3
      ) {
        matches += 1
      }
    }
    return matches
  }, png)
}

test('locates a stranded dwarf by rendering its gold ring at the center', async ({
  page,
}) => {
  await page.goto('/')
  const terrain = page.locator('.world-canvas canvas')
  await expect(terrain).toBeVisible()

  // Seed the live store with a stranded dwarf far from the starting camera.
  // The rest of the interaction uses the real HUD and WebGL scene.
  await page.evaluate(async () => {
    const source = new URL('src/game/', document.baseURI)
    const [{ createInitialSimulation, useGameStore }, { clearCell }] =
      await Promise.all([
        import(new URL('state.ts', source).href),
        import(new URL('generation.ts', source).href),
      ])
    const fixture = createInitialSimulation('recovery-browser-check')
    const position = { x: 116, y: 32 }
    fixture.world = clearCell(clearCell(fixture.world, position), {
      x: position.x,
      y: position.y - 1,
    })
    fixture.dwarves[0] = {
      ...fixture.dwarves[0],
      position,
      movement: 'stranded',
    }
    fixture.safety = {
      phase: 'blocked',
      blockedReason: 'awaiting-recovery',
      emergencyStone: 0,
    }
    useGameStore.setState({
      dynamicCameraEnabled: false,
      paused: true,
      simulation: fixture,
    })
  })

  const alert = page.getByRole('button', {
    name: /Dwarf 1.*Waiting for a safe way out/,
  })
  await expect(alert).toBeVisible()
  expect(await centeredRecoveryPixels(page, terrain)).toBe(0)

  await alert.click()

  await expect
    .poll(() => centeredRecoveryPixels(page, terrain))
    .toBeGreaterThan(8)
})

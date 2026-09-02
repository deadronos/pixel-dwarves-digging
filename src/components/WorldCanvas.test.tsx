import { describe, expect, it } from 'vitest'
import {
  createCameraPauseController,
  isDynamicCameraActive,
} from './cameraTracking'

describe('dynamic camera adapter seams', () => {
  it('pauses after manual input and resumes after the idle window', () => {
    const pause = createCameraPauseController()

    pause.onDragEnd(1_000)

    expect(pause.isPaused(1_001)).toBe(true)
    expect(pause.isPaused(3_499)).toBe(true)
    expect(pause.isPaused(3_500)).toBe(false)
  })

  it('requires both the user toggle and no temporary pause to track', () => {
    expect(isDynamicCameraActive(true, false)).toBe(true)
    expect(isDynamicCameraActive(false, false)).toBe(false)
    expect(isDynamicCameraActive(true, true)).toBe(false)
  })
})

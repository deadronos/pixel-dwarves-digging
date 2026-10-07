import { describe, expect, it } from 'vitest'
import {
  createCameraPauseController,
  hasCameraSettled,
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

describe('demand render camera settling', () => {
  it('reports settled only when position and zoom are within tolerance', () => {
    expect(
      hasCameraSettled({ x: 10, y: 20 }, 9, { x: 10.01, y: 19.99 }, 9.001),
    ).toBe(true)
  })

  it('keeps requesting frames while the camera is still above tolerance', () => {
    expect(hasCameraSettled({ x: 10, y: 20 }, 9, { x: 12, y: 20 }, 9)).toBe(
      false,
    )
    expect(hasCameraSettled({ x: 10, y: 20 }, 9, { x: 10, y: 20 }, 9.5)).toBe(
      false,
    )
  })

  it('honours custom tolerances', () => {
    expect(
      hasCameraSettled({ x: 0, y: 0 }, 1, { x: 1, y: 1 }, 2, 1.5, 1.5),
    ).toBe(true)
    expect(
      hasCameraSettled({ x: 0, y: 0 }, 1, { x: 1, y: 1 }, 2, 0.5, 0.5),
    ).toBe(false)
  })
})

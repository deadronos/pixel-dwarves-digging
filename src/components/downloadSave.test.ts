import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadSave } from './SettingsModal'

describe('downloadSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('attaches the anchor while clicking and revokes the URL later', () => {
    let attachedDuringClick = false
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      attachedDuringClick = document.body.contains(this)
    })

    downloadSave('{}')

    expect(attachedDuringClick).toBe(true)
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})

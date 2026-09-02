import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInitialSimulation, useGameStore } from '../game/state'
import ControlBar from './ControlBar'
import Hud from './Hud'
import Inspector from './Inspector'

describe('live UI panel components', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useGameStore.setState({
      simulation: createInitialSimulation('panel-test-seed'),
      paused: false,
      speed: 1,
      dynamicCameraEnabled: true,
      saveStatus: 'SAVED',
      saveError: null,
    })
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container)
      container = null
    }
  })

  it('renders Hud stably without infinite snapshot loops', () => {
    expect(() => {
      act(() => {
        root?.render(<Hud />)
      })
    }).not.toThrow()

    expect(container?.textContent).toContain('AUTONOMOUS EXCAVATION / RUN 01')
    expect(container?.textContent).toContain('PIXEL DWARVES')
    expect(container?.textContent).toContain('panel-test-seed')
    expect(container?.textContent).toContain('tick 0')
    expect(container?.textContent).toContain('BOOTSTRAP SAFETY')
    expect(container?.textContent).toContain('GLOBAL INVENTORY')

    // Advance simulation tick to ensure re-renders remain stable
    act(() => {
      useGameStore.getState().tickSimulation()
    })

    expect(container?.textContent).toContain('tick 1')
  })

  it('renders a settings button in Hud that opens SettingsModal with camera controls', () => {
    expect(() => {
      act(() => {
        root?.render(<Hud dynamicCameraPaused />)
      })
    }).not.toThrow()

    const gearBtn = container?.querySelector<HTMLButtonElement>('.gear-btn')
    expect(gearBtn).toBeDefined()
    expect(gearBtn?.getAttribute('aria-label')).toBe('Open settings')

    const dialog =
      container?.querySelector<HTMLDialogElement>('.settings-modal')
    expect(dialog).toBeDefined()
    expect(dialog?.hasAttribute('open')).toBe(false)

    // Focus and click gear button to open settings
    gearBtn?.focus()
    expect(document.activeElement).toBe(gearBtn)

    act(() => {
      gearBtn?.click()
    })

    expect(dialog?.hasAttribute('open')).toBe(true)
    expect(container?.textContent).toContain('VIEWPORT & CAMERA')
    expect(container?.textContent).toContain('manual pause')
    expect(container?.textContent).toContain('panel-test-seed')
    expect(container?.textContent).toContain('DANGER ZONE')

    const dynamicInput = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input') ?? [],
    ).find((input) =>
      input.parentElement?.textContent?.includes('DYNAMIC CAMERA'),
    )

    expect(dynamicInput).toBeDefined()
    expect(dynamicInput?.checked).toBe(true)

    act(() => {
      dynamicInput?.click()
    })
    expect(useGameStore.getState().dynamicCameraEnabled).toBe(false)

    // Escape dismisses modal and restores focus to invoking gear button
    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
    expect(dialog?.hasAttribute('open')).toBe(false)
    expect(document.activeElement).toBe(gearBtn)
  })

  it('renders streamlined ControlBar with time and policy controls', () => {
    expect(() => {
      act(() => {
        root?.render(<ControlBar />)
      })
    }).not.toThrow()

    expect(container?.textContent).toContain('TIME')
    expect(container?.textContent).toContain('WORK')
    expect(container?.textContent).toContain('BUILD')
    expect(container?.textContent).toContain('HAUL')
    expect(container?.textContent).toContain('PRIORITY')

    const speedButtons = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('.control-button') ?? [],
    )
    const twoXBtn = speedButtons.find((btn) => btn.textContent?.includes('2×'))
    expect(twoXBtn).toBeDefined()

    act(() => {
      twoXBtn?.click()
    })
    expect(useGameStore.getState().speed).toBe(2)
  })

  it('renders Inspector stably without infinite snapshot loops', () => {
    expect(() => {
      act(() => {
        root?.render(<Inspector />)
      })
    }).not.toThrow()

    expect(container?.textContent).toContain('EXCAVATION')
    expect(container?.textContent).toContain('COLONY')
    expect(container?.textContent).toContain('dwarves3')
    expect(container?.textContent).toContain('STORAGE LOGISTICS')
    expect(container?.textContent).toContain('DIRECTIVE')
    expect(container?.textContent).toContain('PRESTIGE')
    expect(container?.textContent).toContain('PERMANENT UPGRADES')

    // Advance simulation tick to ensure re-renders remain stable
    act(() => {
      useGameStore.getState().tickSimulation()
    })

    expect(container?.textContent).toContain('EXCAVATION')
  })

  it('allows switching between Colony and Upgrades tabs in Inspector', () => {
    act(() => {
      root?.render(<Inspector />)
    })

    const tabColony = container?.querySelector<HTMLButtonElement>('#tab-colony')
    const tabUpgrades =
      container?.querySelector<HTMLButtonElement>('#tab-upgrades')
    const panelColony =
      container?.querySelector<HTMLDivElement>('#panel-colony')
    const panelUpgrades =
      container?.querySelector<HTMLDivElement>('#panel-upgrades')

    expect(tabColony).toBeDefined()
    expect(tabUpgrades).toBeDefined()
    expect(tabColony?.getAttribute('aria-selected')).toBe('true')
    expect(tabUpgrades?.getAttribute('aria-selected')).toBe('false')
    expect(panelColony?.hidden).toBe(false)
    expect(panelUpgrades?.hidden).toBe(true)

    // Switch to Upgrades tab
    act(() => {
      tabUpgrades?.click()
    })

    expect(tabColony?.getAttribute('aria-selected')).toBe('false')
    expect(tabUpgrades?.getAttribute('aria-selected')).toBe('true')
    expect(panelColony?.hidden).toBe(true)
    expect(panelUpgrades?.hidden).toBe(false)

    // Switch back to Colony tab
    act(() => {
      tabColony?.click()
    })

    expect(tabColony?.getAttribute('aria-selected')).toBe('true')
    expect(panelColony?.hidden).toBe(false)
    expect(panelUpgrades?.hidden).toBe(true)
  })
})

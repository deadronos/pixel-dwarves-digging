import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInitialSimulation, useGameStore } from '../game/state'
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
})

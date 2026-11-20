import { StrictMode, useEffect, useState } from 'react'
import indexHtml from '../../index.html?raw'
import { createPortal } from 'react-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './theme-provider'
import { emptyListView, useUIStore } from './ui-store'

function systemPreference(initialDark = false, legacy = false) {
  let matches = initialDark
  const listeners = new Set<() => void>()
  const add = vi.fn((_: string, listener: () => void) => listeners.add(listener))
  const remove = vi.fn((_: string, listener: () => void) => listeners.delete(listener))
  const media = {
    get matches() {
      return matches
    },
    addEventListener: legacy ? undefined : add,
    removeEventListener: legacy ? undefined : remove,
    addListener: vi.fn((listener: () => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: () => void) => listeners.delete(listener)),
  }
  const matchMedia = vi.fn(() => media)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    media,
    matchMedia,
    listeners,
    change(dark: boolean) {
      matches = dark
      act(() => listeners.forEach((listener) => listener()))
    },
  }
}

function ThemeReadout() {
  const { theme, resolvedTheme } = useTheme()
  return <output aria-label="Theme resolution">{`${theme}:${resolvedTheme}`}</output>
}

beforeEach(() => {
  useUIStore.setState({
    theme: 'system',
    returnSnapshots: {},
    sidebarExpanded: false,
    selectedActorId: null,
  })
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  document.head.querySelectorAll('[data-theme-test]').forEach((node) => node.remove())
})

describe('initial theme bootstrap', () => {
  const bootstrap = indexHtml.match(/<script>([\s\S]*?)<\/script>/)![1]!

  beforeEach(() => {
    for (const name of ['color-scheme', 'theme-color']) {
      const meta = document.createElement('meta')
      meta.name = name
      meta.dataset.themeTest = ''
      document.head.append(meta)
    }
  })

  it.each([
    { saved: null, systemDark: true, expected: 'dark' },
    { saved: null, systemDark: false, expected: 'dark' },
    { saved: { version: 1, state: { sidebarExpanded: true } }, systemDark: true, expected: 'dark' },
    { saved: { version: 1, state: { theme: 'light' } }, systemDark: true, expected: 'light' },
    { saved: { version: 1, state: { theme: 'dark' } }, systemDark: false, expected: 'dark' },
    { saved: { version: 1, state: { theme: 'invalid' } }, systemDark: true, expected: 'dark' },
    { saved: { version: 2, state: { theme: 'dark' } }, systemDark: false, expected: 'dark' },
  ])('applies $expected before React for $saved', ({ saved, systemDark, expected }) => {
    systemPreference(systemDark)
    if (saved) localStorage.setItem('ascertain:ui-preferences', JSON.stringify(saved))
    new Function(bootstrap)()
    expect(document.documentElement).toHaveClass(expected)
    expect(document.documentElement.style.colorScheme).toBe(expected)
  })

  it('safely defaults to dark when storage and media APIs are unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.stubGlobal('matchMedia', undefined)
    expect(() => new Function(bootstrap)()).not.toThrow()
    expect(document.documentElement).toHaveClass('dark')
  })
})

describe('ThemeProvider', () => {
  it('resolves the selected system preference and updates root class, native controls and browser chrome', () => {
    systemPreference(true)
    for (const name of ['color-scheme', 'theme-color']) {
      const meta = document.createElement('meta')
      meta.name = name
      meta.dataset.themeTest = ''
      document.head.append(meta)
    }
    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(screen.getByLabelText('Theme resolution')).toHaveTextContent('system:dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).not.toHaveClass('light')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#1e1d1c')
  })

  it('responds to OS changes only while system is selected, including an open patient portal', () => {
    const system = systemPreference()
    render(
      <ThemeProvider>
        {createPortal(
          <div role="dialog" aria-label="Patient">
            <ThemeReadout />
          </div>,
          document.body,
        )}
      </ThemeProvider>,
    )
    system.change(true)
    expect(screen.getByLabelText('Theme resolution')).toHaveTextContent('system:dark')
    act(() => useUIStore.getState().setTheme('light'))
    expect(system.listeners.size).toBe(0)
    const calls = system.matchMedia.mock.calls.length
    system.change(false)
    system.change(true)
    expect(system.matchMedia).toHaveBeenCalledTimes(calls)
    expect(screen.getByLabelText('Theme resolution')).toHaveTextContent('light:light')
    expect(document.documentElement).toHaveClass('light')
    act(() => useUIStore.getState().setTheme('system'))
    expect(system.listeners.size).toBe(1)
    expect(document.documentElement).toHaveClass('dark')
  })

  it('respects a persisted manual preference on the first render', async () => {
    const system = systemPreference(false)
    localStorage.setItem(
      'ascertain:ui-preferences',
      JSON.stringify({ version: 1, state: { theme: 'dark' } }),
    )
    await useUIStore.persist.rehydrate()
    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByLabelText('Theme resolution')).toHaveTextContent('dark:dark')
    expect(system.matchMedia).not.toHaveBeenCalled()
    expect(system.listeners.size).toBe(0)
  })

  it('cleans up OS subscriptions in StrictMode and on unmount', () => {
    const system = systemPreference()
    const { unmount } = render(
      <StrictMode>
        <ThemeProvider>
          <ThemeReadout />
        </ThemeProvider>
      </StrictMode>,
    )
    expect(system.listeners.size).toBe(1)
    unmount()
    expect(system.listeners.size).toBe(0)
  })

  it('supports the legacy WebKit change listener', () => {
    const system = systemPreference(false, true)
    const { unmount } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    )
    expect(system.media.addListener).toHaveBeenCalledOnce()
    system.change(true)
    expect(document.documentElement).toHaveClass('dark')
    unmount()
    expect(system.media.removeListener).toHaveBeenCalledOnce()
  })

  it.each(['missing', 'throws', 'no listeners'])(
    'continues when MediaQuery APIs are %s',
    (mode) => {
      vi.stubGlobal(
        'matchMedia',
        mode === 'missing'
          ? undefined
          : () => {
              if (mode === 'throws') throw new Error('Unavailable')
              return { matches: true }
            },
      )
      render(
        <ThemeProvider>
          <ThemeReadout />
        </ThemeProvider>,
      )
      expect(document.documentElement).toHaveClass(mode === 'no listeners' ? 'dark' : 'light')
      act(() => useUIStore.getState().setTheme('dark'))
      expect(document.documentElement).toHaveClass('dark')
    },
  )

  it('preserves mounted form/list state and saved navigation memory across theme changes', () => {
    const system = systemPreference()
    const mounted = vi.fn()
    function Workspace() {
      const [filter, setFilter] = useState('Active')
      useEffect(() => {
        mounted()
      }, [])
      return (
        <>
          <input aria-label="Unsaved patient draft" defaultValue="Initial" />
          <button onClick={() => setFilter('Inactive')}>{filter}</button>
          <ul aria-label="Patient results">
            <li>Patient one</li>
          </ul>
        </>
      )
    }
    useUIStore
      .getState()
      .updateListView('patients:one', { ...emptyListView(), scrollTop: 840, lastPatientId: 'one' })
    const snapshots = useUIStore.getState().returnSnapshots
    render(
      <ThemeProvider>
        <Workspace />
      </ThemeProvider>,
    )
    const draft = screen.getByRole('textbox')
    const list = screen.getByRole('list')
    fireEvent.change(draft, { target: { value: 'Unsaved edits' } })
    fireEvent.click(screen.getByRole('button', { name: 'Active' }))
    act(() => useUIStore.getState().setTheme('dark'))
    act(() => useUIStore.getState().setTheme('light'))
    act(() => useUIStore.getState().setTheme('system'))
    system.change(true)
    expect(mounted).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toBe(draft)
    expect(draft).toHaveValue('Unsaved edits')
    expect(screen.getByRole('list')).toBe(list)
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeVisible()
    expect(useUIStore.getState().returnSnapshots).toBe(snapshots)
  })
})

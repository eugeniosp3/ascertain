import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/theme-provider'
import { useUIStore } from '@/app/ui-store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeControl } from './ThemeControl'

beforeEach(() => {
  useUIStore.setState({ theme: 'system' })
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  // Radix measures its tooltip arrow; jsdom has no layout observer.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
})

function Control({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={0}>
        <ThemeControl collapsed={collapsed} />
      </TooltipProvider>
    </ThemeProvider>
  )
}

describe('ThemeControl', () => {
  it('exposes the three named radio choices and the current preference', async () => {
    const user = userEvent.setup()
    render(<Control />)
    const trigger = screen.getByRole('button', { name: 'Theme' })
    expect(trigger).toHaveTextContent('System')
    expect(trigger).toHaveAccessibleDescription('Current theme: System')
    expect(trigger.querySelector('[data-theme-icon="light"]')).toHaveClass('lucide-lightbulb')
    await user.click(trigger)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).not.toBeChecked()
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(trigger).toHaveTextContent('Dark')
    expect(trigger).toHaveAccessibleDescription('Current theme: Dark')
    expect(trigger.querySelector('[data-theme-icon="dark"]')).toHaveClass('lucide-lightbulb-off')
    await user.click(trigger)
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
  })

  it('supports keyboard selection and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Control collapsed />)
    const trigger = screen.getByRole('button', { name: 'Theme' })
    trigger.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus())
    await user.keyboard('{Home}{ArrowDown}{Enter}')
    expect(useUIStore.getState().theme).toBe('dark')
    await waitFor(() => expect(trigger).toHaveFocus())
    await user.keyboard('{Enter}{End}{Enter}')
    expect(useUIStore.getState().theme).toBe('system')
    expect(trigger).toHaveFocus()
  })

  it('shows a tooltip only when the label is collapsed, while retaining the same accessible trigger', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Control collapsed />)
    const trigger = screen.getByRole('button', { name: 'Theme' })
    expect(trigger).not.toHaveTextContent('System')
    await user.hover(trigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Theme')
    await user.unhover(trigger)
    rerender(<Control />)
    await user.hover(screen.getByRole('button', { name: 'Theme' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps every instance synchronized through the shared preference', () => {
    render(
      <ThemeProvider>
        <TooltipProvider>
          <ThemeControl />
          <ThemeControl collapsed />
        </TooltipProvider>
      </ThemeProvider>,
    )
    act(() => useUIStore.getState().setTheme('light'))
    const controls = screen.getAllByRole('button', { name: 'Theme' })
    expect(controls[0]).toHaveTextContent('Light')
    for (const control of controls) {
      expect(control).toHaveAccessibleDescription('Current theme: Light')
    }
    expect(JSON.parse(localStorage.getItem('ascertain:ui-preferences')!).state.theme).toBe('light')
  })
})

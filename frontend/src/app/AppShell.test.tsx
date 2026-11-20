import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createAppRouter } from './router'
import { useUIStore } from './ui-store'

vi.mock('./actor-context', () => ({ useActor: () => ({ actorId: 'demo-user' }) }))
vi.mock('./ActorSelector', () => ({ ActorSelector: () => null, actorSelectorId: 'demo-actor' }))
vi.mock('@/components/shared/ThemeControl', () => ({ ThemeControl: () => null }))
vi.mock('@/features/notifications/queries', () => ({
  useNotificationSummary: () => ({ data: undefined }),
}))

function renderShell(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  return render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  useUIStore.setState({ sidebarExpanded: false, returnSnapshots: {} })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('AppShell', () => {
  it('titles an unknown address as not found and marks no section current', async () => {
    renderShell('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible()
    expect(document.title).toBe('Page not found · Ascertain')
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(breadcrumb).getByText('Page not found')).toHaveAttribute('aria-current', 'page')
    const primary = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(primary).queryByRole('link', { current: 'page' })).toBeNull()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    )
  })

  it('keeps the sidebar toggle name, text and expanded state in step', async () => {
    renderShell('/no-such-page')
    const toggle = await screen.findByRole('button', { name: 'Expand sidebar' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Expand sidebar')
    fireEvent.click(toggle)
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(collapse).toHaveTextContent('Collapse sidebar')
  })
})

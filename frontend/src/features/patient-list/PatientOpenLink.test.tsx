import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientListItem } from '@/api/types'
import { getListView } from '@/app/view-state'
import { useUIStore } from '@/app/ui-store'
import { PatientOpenLink } from './PatientOpenLink'
import { defaultListSearch } from './search-params'
import type { PatientListGeometry } from './scroll-restoration'

function mount({ cancelled = false } = {}) {
  const geometry: PatientListGeometry = {
    scope: 'origin',
    measurements: [],
    scrollTop: 700,
    viewport: { width: 364, height: 195 },
    rowTop: 92,
    actionTop: 110,
    pin: null,
  }
  const captureOrigin = vi.fn((action: HTMLAnchorElement) => {
    expect(action).toBe(screen.getByRole('link', { name: 'Open notes' }))
    expect(action.isConnected).toBe(true)
    return geometry
  })
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <PatientOpenLink
        patient={{ id: 'p-4' } as PatientListItem}
        index={4}
        tab="notes"
        context={{ actorId: 'one', view: 'patients', search: defaultListSearch, captureOrigin }}
        onClick={(event) => {
          if (cancelled) event.preventDefault()
        }}
      >
        Open notes
      </PatientOpenLink>
    ),
  })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/patients/$patientId',
    component: () => <div>Workspace</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  return { captureOrigin, geometry }
}

beforeEach(() => {
  useUIStore.setState({ returnSnapshots: {} })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('patient origin navigation', () => {
  it('captures the actual action before navigation unmounts it', async () => {
    const { captureOrigin, geometry } = mount()
    fireEvent.click(await screen.findByRole('link', { name: 'Open notes' }))
    await screen.findByText('Workspace')
    expect(captureOrigin).toHaveBeenCalledOnce()
    expect(getListView('patients', 'one')).toMatchObject({
      lastPatientId: 'p-4',
      lastRowIndex: 4,
      triggerTab: 'notes',
      restoreFocus: true,
      scrollTop: 700,
      geometry,
    })
  })

  it('does not replace navigation memory when an action is cancelled', async () => {
    const { captureOrigin } = mount({ cancelled: true })
    fireEvent.click(await screen.findByRole('link', { name: 'Open notes' }))
    expect(captureOrigin).not.toHaveBeenCalled()
    expect(getListView('patients', 'one').restoreFocus).toBe(false)
  })

  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])('leaves modified navigation memory alone: %j', async (modifiers) => {
    const { captureOrigin } = mount()
    const link = await screen.findByRole('link', { name: 'Open notes' })
    // Suppress jsdom's unsupported default document navigation after React's handler.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true })
    fireEvent.click(link, modifiers)
    expect(captureOrigin).not.toHaveBeenCalled()
    expect(getListView('patients', 'one').restoreFocus).toBe(false)
  })
})

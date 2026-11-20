import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultListSearch, validateListSearch, type ListView } from './search-params'
import PatientListScreen from './PatientListScreen'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@/api', () => ({ api: {}, dataMode: 'demo' }))
vi.mock('@/app/actor-context', () => ({ useActor: () => ({ actorId: 'demo-one' }) }))
vi.mock('./queries', () => ({ usePatientList: mocks.list }))
vi.mock('@/features/notifications/queries', () => ({ useNotificationSummary: mocks.summary }))

function renderList(view: ListView = 'patients', query = '') {
  const root = createRootRoute({ component: Outlet })
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: validateListSearch,
    component: () => <PatientListScreen view={view} />,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/${query}`] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  mocks.refetch.mockReset()
  mocks.list.mockReturnValue({
    isPending: false,
    isFetching: false,
    isError: false,
    isPlaceholderData: false,
    data: { items: [], total: 0, page: 1, page_size: 20 },
    refetch: mocks.refetch,
  })
  mocks.summary.mockReturnValue({
    data: { unread_comments_count: 3, patients_with_unread_comments: 2 },
    isError: false,
  })
})

describe('patient list states', () => {
  it('distinguishes initial loading from a completed empty directory', async () => {
    mocks.list.mockReturnValue({
      isPending: true,
      isFetching: true,
      isError: false,
      data: undefined,
    })
    renderList()
    expect(await screen.findByRole('status')).toHaveTextContent('Loading patients…')
    // The skeleton is decorative so loading is announced once, by the status region.
    expect(document.querySelector('.ac-list-skeleton')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText('No patients yet')).not.toBeInTheDocument()
  })
  it('shows a directory empty state without manufacturing patient rows', async () => {
    renderList()
    expect(await screen.findByRole('heading', { name: 'No patients yet' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('keeps filtered no-matches distinct from all-caught-up notifications', async () => {
    renderList('notifications', '?q=not-found')
    expect(await screen.findByRole('heading', { name: 'No matching patients' })).toBeInTheDocument()
    expect(screen.getByText('3 unread comments across 2 patients')).toBeInTheDocument()
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(mocks.list).toHaveBeenCalledWith(
      { ...defaultListSearch, q: 'not-found' },
      'notifications',
      'demo-one',
    )
  })
  it('shows all-caught-up when the global unread total reaches zero', async () => {
    mocks.summary.mockReturnValue({
      data: { unread_comments_count: 0, patients_with_unread_comments: 0 },
      isError: false,
    })
    renderList('notifications')
    expect(await screen.findByRole('heading', { name: 'You’re all caught up' })).toBeInTheDocument()
  })
  it('keeps a just-typed trailing space after the debounced search commits to the URL', async () => {
    // Real router on the real list path: the commit is a replace navigation the screen observes.
    const root = createRootRoute({ component: Outlet })
    const route = createRoute({
      getParentRoute: () => root,
      path: '/patients',
      validateSearch: validateListSearch,
      component: () => <PatientListScreen view="patients" />,
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/patients'] }),
    })
    render(<RouterProvider router={router} />)
    const input = await screen.findByRole('searchbox', { name: 'Search patients' })
    fireEvent.change(input, { target: { value: 'John ' } })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'John' }))
    // Let every render of the committed navigation settle before reading the draft.
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    expect(router.state.location.search).toMatchObject({ q: 'John', page: 1 })
    expect(mocks.list).toHaveBeenLastCalledWith(
      { ...defaultListSearch, q: 'John' },
      'patients',
      'demo-one',
    )
    expect(input).toHaveValue('John ')
  })
  it('shows a genuine API failure with a working retry action', async () => {
    mocks.list.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: true,
      data: undefined,
      error: new Error('Access denied.'),
      refetch: mocks.refetch,
    })
    renderList()
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No patients yet')).not.toBeInTheDocument()
  })
})

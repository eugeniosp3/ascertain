import { useState } from 'react'
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
import { ApiError } from '@/api'
import type { PatientListItem } from '@/api/types'
import { defaultListSearch, validateListSearch, type ListView } from './search-params'
import PatientListScreen from './PatientListScreen'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@/api', async () => {
  const { ApiError, isApiError } = await import('@/api/client')
  return { api: {}, dataMode: 'demo', ApiError, isApiError }
})
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

function patient(index: number): PatientListItem {
  return {
    id: `p-${index}`,
    assigned_user_id: null,
    first_name: `Patient ${index}`,
    last_name: 'Example',
    middle_initial: null,
    name: `Patient ${index} Example`,
    source_patient_id: `PT-${index}`,
    mrn: null,
    date_of_birth: '1980-01-01',
    age: 46,
    last_visit: null,
    status: 'active',
    conditions: [],
    notes_count: 0,
    comments_count: 0,
    unread_comments_count: 0,
  }
}
// A last good page of two patients, as a successful earlier load left it in the cache.
const cachedPage = { items: [patient(1), patient(2)], total: 2, page: 1, page_size: 20 }
const refreshNotice = 'Couldn’t refresh the patient list.'

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
    // With nothing loaded yet, the full panel replaces the results; no pagination or notice.
    expect(screen.getByRole('status')).toHaveTextContent('Patient list unavailable')
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
    expect(screen.queryByText(refreshNotice)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No patients yet')).not.toBeInTheDocument()
  })
  it('keeps the last good page and pagination when a background refresh fails', async () => {
    // The refresh fails until Retry succeeds; the cached page stays in data throughout.
    function useRecoveringList() {
      const [failed, setFailed] = useState(true)
      return {
        isPending: false,
        isFetching: false,
        isError: failed,
        isRefetchError: failed,
        isPlaceholderData: false,
        data: cachedPage,
        error: failed ? new ApiError(503, 'unavailable', 'Service unavailable.') : null,
        refetch: () => {
          mocks.refetch()
          setFailed(false)
          return Promise.resolve()
        },
      }
    }
    mocks.list.mockImplementation(useRecoveringList)
    // Give the virtualized table a viewport so its rows render in jsdom (as PatientResults.test).
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(216)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(7000)
    renderList()
    const table = await screen.findByRole('table')
    expect(table).toHaveTextContent('Patient 1 Example')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 patients')
    // The failure is polite: no alert, and Retry sits beside the live region, not inside it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const notice = screen.getByText(refreshNotice)
    expect(notice).toHaveAttribute('aria-live', 'polite')
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(notice).not.toContainElement(retry)
    fireEvent.click(retry)
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
    // The region stays mounted and only its text clears once the refresh succeeds.
    expect(notice).toBeInTheDocument()
    expect(notice).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('Patient 1 Example')
  })
  it.each([401, 403])(
    'hides cached rows when a refresh fails with %i, since access may have changed',
    async (status) => {
      mocks.list.mockReturnValue({
        isPending: false,
        isFetching: false,
        isError: true,
        isRefetchError: true,
        isPlaceholderData: false,
        data: cachedPage,
        error: new ApiError(status, 'forbidden', 'You can no longer view these patients.'),
        refetch: mocks.refetch,
      })
      renderList()
      expect(await screen.findByRole('alert')).toHaveTextContent('Patients couldn’t be loaded')
      expect(screen.getByRole('alert')).toHaveTextContent('You can no longer view these patients.')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByText(/Patient 1 Example/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Patient list unavailable')
      expect(screen.queryByText(refreshNotice)).not.toBeInTheDocument()
    },
  )
})

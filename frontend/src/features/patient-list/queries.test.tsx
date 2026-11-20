import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page, PatientListItem } from '@/api/types'
import { defaultListSearch } from './search-params'
import { usePatientList } from './queries'

const { listPatients } = vi.hoisted(() => ({ listPatients: vi.fn() }))
vi.mock('@/api', () => ({ api: { listPatients }, dataMode: 'demo' }))

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}
const page = (total: number): Page<PatientListItem> => ({
  items: [],
  total,
  page: 1,
  page_size: 20,
})

beforeEach(() => {
  listPatients.mockReset()
})

describe('patient list requests', () => {
  it.each(['patients', 'notifications'] as const)(
    'waits for a valid actor before requesting the %s list',
    async (view) => {
      listPatients.mockResolvedValue(page(4))
      const initialProps: { actorId: string | null } = { actorId: null }
      const { result, rerender } = renderHook(
        ({ actorId }: { actorId: string | null }) =>
          usePatientList(defaultListSearch, view, actorId),
        { initialProps, wrapper: wrapper() },
      )
      expect(listPatients).not.toHaveBeenCalled()
      expect(result.current.fetchStatus).toBe('idle')
      rerender({ actorId: 'actor-one' })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(listPatients).toHaveBeenCalledTimes(1)
    },
  )
  it('passes cancellation, actor, and the dataset-wide unread filter to the API', async () => {
    listPatients.mockResolvedValue(page(4))
    const { result } = renderHook(
      () =>
        usePatientList({ ...defaultListSearch, q: 'Ada', page: 3 }, 'notifications', 'actor-one'),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(listPatients).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Ada', page: 3, has_unread_comments: true }),
      expect.objectContaining({ actorId: 'actor-one', signal: expect.any(AbortSignal) }),
    )
  })
  it('keeps previous results while paging within the same actor and view', async () => {
    listPatients.mockResolvedValueOnce(page(40)).mockImplementationOnce(() => new Promise(() => {}))
    const { result, rerender } = renderHook(
      ({ currentPage }) =>
        usePatientList({ ...defaultListSearch, page: currentPage }, 'patients', 'actor-one'),
      { initialProps: { currentPage: 1 }, wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ currentPage: 2 })
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data?.total).toBe(40)
  })
  it('never displays another actor’s cached unread counts during a switch', async () => {
    listPatients.mockResolvedValueOnce(page(40)).mockImplementationOnce(() => new Promise(() => {}))
    const { result, rerender } = renderHook(
      ({ actorId }) => usePatientList(defaultListSearch, 'patients', actorId),
      { initialProps: { actorId: 'actor-one' }, wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ actorId: 'actor-two' })
    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
  })
  it('does not reuse a regular list as an unread queue', async () => {
    listPatients
      .mockResolvedValueOnce(page(100))
      .mockImplementationOnce(() => new Promise(() => {}))
    const { result, rerender } = renderHook(
      ({ view }: { view: 'patients' | 'notifications' }) =>
        usePatientList(defaultListSearch, view, 'actor-one'),
      { initialProps: { view: 'patients' }, wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ view: 'notifications' })
    expect(result.current.data).toBeUndefined()
  })
  it('cancels an obsolete server search instead of showing an error', async () => {
    listPatients.mockImplementation(() => new Promise(() => {}))
    const { result, rerender } = renderHook(
      ({ q }) => usePatientList({ ...defaultListSearch, q }, 'patients', 'actor-one'),
      { initialProps: { q: 'A' }, wrapper: wrapper() },
    )
    await waitFor(() => expect(listPatients).toHaveBeenCalledTimes(1))
    const firstSignal = (listPatients.mock.calls[0]?.[1] as { signal: AbortSignal }).signal
    act(() => rerender({ q: 'Ada' }))
    expect(firstSignal.aborted).toBe(true)
    expect(result.current.isError).toBe(false)
  })
})

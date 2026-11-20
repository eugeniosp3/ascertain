import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/api'
import type { PatientListItem } from '@/api/types'
import { patientKeys } from '@/app/query-keys'
import { invalidateNotes } from '@/features/patient-detail/queries'
import { IncompleteProjectionError } from './projection'
import { useOverviewProjection } from './queries'
import { makePage, makePatient } from './test-data'

const ofOne = (id: string, overrides: Partial<PatientListItem> = {}) =>
  makePatient(id, { assigned_user_id: 'actor-one', ...overrides })
const ofTwo = (id: string) => makePatient(id, { assigned_user_id: 'actor-two' })

const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})

describe('shared assigned overview query', () => {
  it('waits for a selected actor and shares one complete paged projection across consumers', async () => {
    const list = vi
      .spyOn(api, 'listPatients')
      .mockResolvedValueOnce(
        makePage(
          Array.from({ length: 100 }, (_, index) => ofOne(String(index))),
          { total: 101 },
        ),
      )
      .mockResolvedValueOnce(makePage([ofOne('last')], { total: 101, page: 2 }))
    const { client, wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ actorId }: { actorId: string | null }) => [
        useOverviewProjection(actorId),
        useOverviewProjection(actorId),
      ],
      { wrapper, initialProps: { actorId: null as string | null } },
    )
    expect(list).not.toHaveBeenCalled()
    rerender({ actorId: 'actor-one' })
    await waitFor(() => expect(result.current[0]?.data?.patients).toHaveLength(101))
    expect(result.current[0]?.data).toBe(result.current[1]?.data)
    expect(result.current[0]?.data?.scope).toBe('assigned')
    expect(client.getQueryData(patientKeys.overview('actor-one', 'assigned'))).toBe(
      result.current[0]?.data,
    )
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[0]).toEqual([
      expect.objectContaining({ assigned_to: 'me', page: 1, page_size: 100 }),
      { actorId: 'actor-one', signal: expect.any(AbortSignal) },
    ])
  })

  it('keeps per-actor cohorts separate across A→B→A without showing the previous actor', async () => {
    const list = vi
      .spyOn(api, 'listPatients')
      .mockImplementation(async (_, ctx) =>
        makePage(ctx?.actorId === 'actor-two' ? [ofTwo('b1'), ofTwo('b2')] : [ofOne('a1')]),
      )
    const { wrapper } = setup()
    const { result, rerender } = renderHook(({ actorId }) => useOverviewProjection(actorId), {
      wrapper,
      initialProps: { actorId: 'actor-one' },
    })
    await waitFor(() => expect(result.current.data?.patients.map((p) => p.id)).toEqual(['a1']))
    rerender({ actorId: 'actor-two' })
    expect(result.current.data).toBeUndefined()
    await waitFor(() =>
      expect(result.current.data?.patients.map((p) => p.id)).toEqual(['b1', 'b2']),
    )
    rerender({ actorId: 'actor-one' })
    // Switching back reuses A's fresh cached cohort instead of B's rows or a new request.
    expect(result.current.data?.patients.map((p) => p.id)).toEqual(['a1'])
    expect(list.mock.calls.map(([, ctx]) => ctx?.actorId)).toEqual(['actor-one', 'actor-two'])
  })

  it("fails instead of charting a cohort that includes another actor's patient", async () => {
    vi.spyOn(api, 'listPatients').mockResolvedValue(makePage([ofOne('a1'), ofTwo('b1')]))
    const { wrapper } = setup()
    const { result } = renderHook(() => useOverviewProjection('actor-one'), { wrapper })
    // Asserted on the first attempt: unverifiable projections use the normal transient retry policy.
    await waitFor(() =>
      expect(result.current.failureReason).toBeInstanceOf(IncompleteProjectionError),
    )
    expect(result.current.data).toBeUndefined()
  })

  it('aborts the projection when its last consumer leaves', async () => {
    const list = vi.spyOn(api, 'listPatients').mockImplementation(() => new Promise(() => {}))
    const { wrapper } = setup()
    const { unmount } = renderHook(() => useOverviewProjection('actor-one'), { wrapper })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    const signal = list.mock.calls[0]?.[1]?.signal
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('refetches through existing note, patient-list and per-viewer list invalidations', async () => {
    const list = vi.spyOn(api, 'listPatients').mockResolvedValue(makePage([ofOne('one')]))
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useOverviewProjection('actor-one'), { wrapper })
    await waitFor(() => expect(result.current.data?.patients).toHaveLength(1))
    list.mockResolvedValue(makePage([ofOne('one', { notes_count: 3 })]))
    await act(() => invalidateNotes(client, 'one'))
    expect(list).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.data?.patients[0]?.notes_count).toBe(3))
    // Patient create/update/delete invalidate every list; a creator's new patient joins the cohort.
    list.mockResolvedValue(makePage([ofOne('one', { status: 'inactive' }), ofOne('created')]))
    await act(() => client.invalidateQueries({ queryKey: patientKeys.lists() }))
    await waitFor(() => expect(result.current.data?.patients).toHaveLength(2))
    expect(result.current.data?.patients[0]?.status).toBe('inactive')
    list.mockResolvedValue(makePage([]))
    await act(() => client.invalidateQueries({ queryKey: patientKeys.lists('actor-one') }))
    await waitFor(() => expect(result.current.data?.patients).toEqual([]))
    expect(list).toHaveBeenCalledTimes(4)
  })

  it('retains only the previous complete data when a later refresh page fails', async () => {
    const list = vi.spyOn(api, 'listPatients').mockResolvedValueOnce(makePage([ofOne('original')]))
    const { wrapper } = setup()
    const { result } = renderHook(() => useOverviewProjection('actor-one'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const previous = result.current.data
    list
      .mockResolvedValueOnce(
        makePage(
          Array.from({ length: 100 }, (_, index) => ofOne(String(index))),
          { total: 101 },
        ),
      )
      .mockRejectedValueOnce(new ApiError(403, 'forbidden', 'Unavailable'))
    await act(() => result.current.refetch())
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBe(previous)
    expect(result.current.data?.patients).toHaveLength(1)
  })
})

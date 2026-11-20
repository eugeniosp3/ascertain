import { describe, expect, it, vi } from 'vitest'
import type { DashboardApi, PatientListItem } from '@/api/types'
import { fetchOverviewProjection, IncompleteProjectionError } from './projection'
import { makePage, makePatient } from './test-data'

const assigned = (id: string, overrides: Partial<PatientListItem> = {}) =>
  makePatient(id, { assigned_user_id: 'actor', ...overrides })
const firstPage = Array.from({ length: 100 }, (_, index) => assigned(String(index)))
const clock = () => new Date('2026-11-21T00:30:00Z')

describe('complete assigned overview projection', () => {
  it("loads all 201 of the actor's assigned patients across pages with one actor and cancellation signal", async () => {
    const list = vi
      .fn<DashboardApi['listPatients']>()
      .mockResolvedValueOnce(makePage(firstPage, { total: 201 }))
      .mockResolvedValueOnce(
        makePage(
          firstPage.map((patient) => ({ ...patient, id: `second-${patient.id}` })),
          { total: 201, page: 2 },
        ),
      )
      .mockResolvedValueOnce(makePage([assigned('last')], { total: 201, page: 3 }))
    const signal = new AbortController().signal
    const result = await fetchOverviewProjection(list, 'actor', signal, clock)
    expect(result.scope).toBe('assigned')
    expect(result.patients).toHaveLength(201)
    expect(result.asOfDate).toBe('2026-11-21')
    expect(list).toHaveBeenCalledTimes(3)
    for (let index = 0; index < 3; index += 1) {
      expect(list).toHaveBeenNthCalledWith(
        index + 1,
        { assigned_to: 'me', page: index + 1, page_size: 100, sort_by: 'name', order: 'asc' },
        { actorId: 'actor', signal },
      )
    }
  })

  it('accepts a verified empty cohort after one request', async () => {
    const list = vi.fn<DashboardApi['listPatients']>().mockResolvedValue(makePage([]))
    expect(
      await fetchOverviewProjection(list, 'actor', new AbortController().signal),
    ).toMatchObject({ scope: 'assigned', patients: [] })
    expect(list).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['another actor', 'someone-else'],
    ['nobody', null],
    ['a missing assignment', undefined],
  ])('rejects a row assigned to %s instead of charting it', async (_, assignee) => {
    const stray = { ...assigned('stray'), assigned_user_id: assignee } as PatientListItem
    const list = vi
      .fn<DashboardApi['listPatients']>()
      .mockResolvedValue(makePage([assigned('mine'), stray]))
    await expect(
      fetchOverviewProjection(list, 'actor', new AbortController().signal),
    ).rejects.toBeInstanceOf(IncompleteProjectionError)
  })

  it.each([
    ['a missing later row', makePage([], { total: 101, page: 2 })],
    ['a duplicated patient across pages', makePage([firstPage[0]!], { total: 101, page: 2 })],
    ['a missing patient ID', makePage([assigned('')], { total: 101, page: 2 })],
    ['an unexpected page', makePage([assigned('last')], { total: 101, page: 1 })],
    ['a changed total', makePage([assigned('last')], { total: 102, page: 2 })],
    [
      'an unexpected page size',
      makePage([assigned('last')], { total: 101, page: 2, page_size: 20 }),
    ],
  ])(
    'rejects %s instead of returning a partial or misleading population',
    async (_, secondPage) => {
      const list = vi
        .fn<DashboardApi['listPatients']>()
        .mockResolvedValueOnce(makePage(firstPage, { total: 101 }))
        .mockResolvedValueOnce(secondPage)
      await expect(
        fetchOverviewProjection(list, 'actor', new AbortController().signal),
      ).rejects.toBeInstanceOf(IncompleteProjectionError)
    },
  )

  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid total of %s', async (total) => {
    const list = vi.fn<DashboardApi['listPatients']>().mockResolvedValue(makePage([], { total }))
    await expect(
      fetchOverviewProjection(list, 'actor', new AbortController().signal),
    ).rejects.toBeInstanceOf(IncompleteProjectionError)
  })

  it('rejects a failed later page without ever resolving the first 100 patients', async () => {
    const list = vi
      .fn<DashboardApi['listPatients']>()
      .mockResolvedValueOnce(makePage(firstPage, { total: 101 }))
      .mockRejectedValueOnce(new Error('Page two unavailable'))
    await expect(
      fetchOverviewProjection(list, 'actor', new AbortController().signal),
    ).rejects.toThrow('Page two unavailable')
  })

  it('stops on cancellation, including adapters that resolve after the request was aborted', async () => {
    const controller = new AbortController()
    const list = vi.fn<DashboardApi['listPatients']>().mockImplementation(async () => {
      controller.abort()
      return makePage(firstPage, { total: 101 })
    })
    await expect(fetchOverviewProjection(list, 'actor', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(list).toHaveBeenCalledTimes(1)
    list.mockClear()
    await expect(fetchOverviewProjection(list, 'actor', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(list).not.toHaveBeenCalled()
  })

  it.each([
    // [viewer clock as a local-offset instant, expected UTC reference date]
    [
      'Tokyo 08:30 on Dec 1 (+09:00), still Nov 30 in UTC',
      '2026-12-01T08:30:00+09:00',
      '2026-11-30',
    ],
    [
      'New York 19:30 on Nov 30 (-05:00), already Dec 1 in UTC',
      '2026-11-30T19:30:00-05:00',
      '2026-12-01',
    ],
    ['the last UTC instant of November', '2026-11-30T23:59:59.999Z', '2026-11-30'],
    ['the first UTC instant of December', '2026-12-01T00:00:00.000Z', '2026-12-01'],
  ])('uses the UTC calendar date for %s', async (_, instant, expected) => {
    const list = vi.fn<DashboardApi['listPatients']>().mockResolvedValue(makePage([]))
    const result = await fetchOverviewProjection(
      list,
      'actor',
      new AbortController().signal,
      () => new Date(instant),
    )
    // The viewer's own zone never changes the population date or which month is partial.
    expect(result.asOfDate).toBe(expected)
  })
})

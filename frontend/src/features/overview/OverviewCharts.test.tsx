import { useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/api'
import { aggregateOverview } from './aggregation'
import { OverviewCharts } from './OverviewCharts'
import { overviewCopy } from './copy'
import { useOverviewProjection } from './queries'
import { makePage, makePatient } from './test-data'

const asOfDate = '2026-11-20'
const sam = 'Demo User 1 · Sam Rivera'
const baseProps = {
  isFetching: false,
  isError: false,
  updatedAt: 0,
  onRetry: vi.fn(),
  copy: overviewCopy('assigned', sam),
}

describe('Overview chart presentation', () => {
  it('renders four named figures and honest all-active, age and note counts as text', () => {
    const summary = aggregateOverview(
      [makePatient('one', { age: 17, notes_count: 2 }), makePatient('two', { age: 80 })],
      asOfDate,
    )
    render(<OverviewCharts {...baseProps} summary={summary} />)
    expect(screen.getAllByRole('figure')).toHaveLength(4)
    const status = screen.getByRole('figure', { name: 'Patient status' })
    const statusRows = within(status).getAllByRole('listitem')
    expect(statusRows[0]).toHaveTextContent('Active2 of 2 patients, 100%')
    expect(statusRows[1]).toHaveTextContent('Inactive0 of 2 patients, 0%')
    const ages = screen.getByRole('figure', { name: 'Age bands' })
    expect(within(ages).getAllByRole('listitem')[0]).toHaveTextContent('0–171 of 2 patients, 50%')
    const notes = screen.getByRole('figure', { name: 'Clinical-note coverage' })
    expect(notes).toHaveTextContent('50%')
    expect(notes).toHaveTextContent('2 active notes in total')
    expect(status).toHaveTextContent('2 active of 2')
  })

  it('offers keyboard focus, pointer-independent month inspection, range changes, and a count table', async () => {
    const user = userEvent.setup()
    const summary = aggregateOverview(
      [
        makePatient('dec', { last_visit: '2025-12-31' }),
        makePatient('may', { last_visit: '2026-05-01' }),
        makePatient('nov', { last_visit: '2026-11-20' }),
        makePatient('none'),
      ],
      asOfDate,
    )
    render(<OverviewCharts {...baseProps} summary={summary} />)
    const chart = screen.getByRole('figure', { name: 'Latest recorded visit' })
    expect(chart).toHaveTextContent(
      'Each patient counted once, by most recent recorded visit — not total appointments. Nov 2026 is partial.',
    )
    expect(screen.getByText(/As of/)).toHaveTextContent('Nov 20, 2026 (UTC)')
    const slider = within(chart).getByRole('slider', { name: /Inspect month/ })
    // Inspection opens on the last complete month; the running month is labelled partial.
    expect(slider).toHaveAttribute('aria-valuetext', 'Oct 2026: 0 of 4 patients (0%)')
    expect(slider).toHaveValue('10')
    fireEvent.change(slider, { target: { value: '11' } })
    expect(slider).toHaveAttribute('aria-valuetext', 'Nov 2026 (partial): 1 of 4 patients (25%)')
    slider.focus()
    expect(slider).toHaveFocus()
    fireEvent.change(slider, { target: { value: '0' } })
    expect(slider).toHaveAttribute('aria-valuetext', 'Dec 2025: 1 of 4 patients (25%)')
    await user.click(within(chart).getByRole('button', { name: '6 months' }))
    expect(within(chart).getByRole('button', { name: '6 months' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(slider).toHaveAttribute('max', '5')
    expect(within(chart).getAllByRole('listitem')[0]).toHaveTextContent(
      'Before Jun 20262 of 4 patients, 50%',
    )
    expect(within(chart).getAllByRole('listitem')[1]).toHaveTextContent(
      'No visit recorded1 of 4 patients, 25%',
    )
    const toggle = within(chart).getByRole('button', { name: 'View monthly counts' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(chart).queryByRole('table')).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const table = within(chart).getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(within(table).getByRole('row', { name: 'Nov 2026 (partial) 1 25%' })).toBeVisible()
    expect(within(table).getByRole('row', { name: 'Oct 2026 0 0%' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Your patients' })).toHaveTextContent(
      `Assigned to ${sam}`,
    )
  })

  it('presents an empty dataset as zeros rather than NaN or an invented split', () => {
    const { container } = render(
      <OverviewCharts {...baseProps} summary={aggregateOverview([], asOfDate)} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('No patients are assigned to you yet')
    expect(screen.getAllByRole('figure')).toHaveLength(4)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Oct 2026: 0 of 0 patients (0%)',
    )
  })

  it('distinguishes loading, initial failure, and refresh failure with retained verified data', async () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <OverviewCharts {...baseProps} summary={undefined} isFetching onRetry={onRetry} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading your assigned patients')
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
    rerender(<OverviewCharts {...baseProps} summary={undefined} isError onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No partial totals are shown')
    await userEvent.click(screen.getByRole('button', { name: 'Retry overview' }))
    expect(onRetry).toHaveBeenCalledOnce()
    const summary = aggregateOverview([makePatient('one')], asOfDate)
    rerender(<OverviewCharts {...baseProps} summary={summary} isFetching onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing your assigned patients')
    rerender(<OverviewCharts {...baseProps} summary={summary} isError onRetry={onRetry} />)
    // A failed background refresh keeps the verified charts and does not interrupt the user.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const failed = 'Refresh failed. Showing the last complete overview.'
    const notice = screen.getByText(failed)
    expect(notice).toHaveAttribute('aria-live', 'polite')
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(notice).not.toContainElement(retry)
    await userEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('figure')).toHaveLength(4)
    // The live region stays mounted and only its text changes, so a repeat failure is announced.
    rerender(<OverviewCharts {...baseProps} summary={summary} onRetry={onRetry} />)
    expect(notice).toBeInTheDocument()
    expect(notice).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    rerender(<OverviewCharts {...baseProps} summary={summary} isError onRetry={onRetry} />)
    expect(screen.getByText(failed)).toBe(notice)
  })

  it('never renders chart totals from a successful first page when a later page fails', async () => {
    vi.spyOn(api, 'listPatients')
      .mockResolvedValueOnce(
        makePage(
          // Rows belong to the actor, so page one passes membership and page two's 403 is reached.
          Array.from({ length: 100 }, (_, index) =>
            makePatient(String(index), { assigned_user_id: 'actor-one' }),
          ),
          { total: 101 },
        ),
      )
      .mockRejectedValueOnce(new ApiError(403, 'forbidden', 'Unavailable'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function ProjectionCharts() {
      const query = useOverviewProjection('actor-one')
      const summary = useMemo(
        () => query.data && aggregateOverview(query.data.patients, query.data.asOfDate),
        [query.data],
      )
      return (
        <OverviewCharts
          copy={overviewCopy(query.data?.scope ?? 'assigned', sam)}
          summary={summary}
          isFetching={query.isFetching}
          isError={query.isError}
          updatedAt={query.dataUpdatedAt}
          onRetry={() => void query.refetch()}
        />
      )
    }
    const view = render(
      <QueryClientProvider client={client}>
        <ProjectionCharts />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('No partial totals are shown')
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
    view.unmount()
    client.clear()
  })

  it('inspects the nearest month from pointer position and keeps markers on a zero-based axis', () => {
    const summary = aggregateOverview(
      [
        makePatient('a', { last_visit: '2025-12-02' }),
        makePatient('b', { last_visit: '2026-06-02' }),
        makePatient('c', { last_visit: '2026-06-10' }),
      ],
      asOfDate,
    )
    const { container } = render(<OverviewCharts {...baseProps} summary={summary} />)
    const chart = screen.getByRole('figure', { name: 'Latest recorded visit' })
    const area = container.querySelector<HTMLElement>('.ac-visits-area')!
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 110,
      top: 0,
      height: 100,
    } as DOMRect)
    // 12 points over 110px: x = 100 + 6 × 10 lands on the seventh month, Jun 2026.
    fireEvent.pointerMove(area.parentElement!, { clientX: 161 })
    expect(within(chart).getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Jun 2026: 2 of 3 patients (66.7%)',
    )
    fireEvent.pointerDown(area.parentElement!, { clientX: 0 })
    expect(within(chart).getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Dec 2025: 1 of 3 patients (33.3%)',
    )
    // Axis ceiling for a maximum of 2 is 2, so the June marker sits on the top gridline.
    const points = container.querySelectorAll<HTMLElement>('.ac-visits-point')
    expect(points).toHaveLength(12)
    expect(points[6]!.style.top).toBe('0%')
    expect(points[11]!.style.top).toBe('100%')
  })

  it('keeps an all-active population and an empty visit window visibly intentional', () => {
    const summary = aggregateOverview(
      Array.from({ length: 3 }, (_, index) => makePatient(String(index), { notes_count: 1 })),
      asOfDate,
    )
    const { container } = render(<OverviewCharts {...baseProps} summary={summary} />)
    const status = screen.getByRole('figure', { name: 'Patient status' })
    expect(status).toHaveTextContent('3 active of 3')
    expect(within(status).getAllByRole('listitem')[1]).toHaveTextContent(
      'Inactive0 of 3 patients, 0%',
    )
    // Zero-count segments are omitted rather than drawn as slivers.
    expect(status.querySelectorAll('.ac-proportion > span')).toHaveLength(1)
    expect(screen.getByText('No latest visits recorded in these months.')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Clinical-note coverage' })).toHaveTextContent(
      '100% have ≥1 active note',
    )
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('draws the running month as a distinct dashed leg with a hollow marker', () => {
    const summary = aggregateOverview(
      [
        makePatient('oct', { last_visit: '2026-10-15' }),
        makePatient('nov', { last_visit: '2026-11-02' }),
      ],
      asOfDate,
    )
    const { container } = render(<OverviewCharts {...baseProps} summary={summary} />)
    const points = container.querySelectorAll<HTMLElement>('.ac-visits-point')
    expect(points[11]).toHaveAttribute('data-partial')
    expect(points[10]).not.toHaveAttribute('data-partial')
    expect(points[10]).toHaveAttribute('data-active')
    const partial = container.querySelector('.ac-visits-partial')!
    // The dashed leg joins the last complete month (x = 10/11) to the running month (x = 100).
    expect(partial.getAttribute('d')).toMatch(/^M90\.9\d*,\S+ L100,/)
    expect(container.querySelector('.ac-visits-fill')!.getAttribute('d')).not.toContain('L100,')
    expect(container.querySelector('.ac-visits-x li[data-partial]')).toHaveTextContent('Nov')
  })

  it('labels the selected user’s assigned cohort verbatim and keeps unread global', async () => {
    const user = userEvent.setup()
    const summary = aggregateOverview([makePatient('one', { last_visit: '2026-10-02' })], asOfDate)
    render(<OverviewCharts {...baseProps} summary={summary} />)
    const region = screen.getByRole('region', { name: 'Your patients' })
    expect(region).toHaveTextContent('Assigned to Demo User 1 · Sam Rivera')
    expect(region).not.toHaveTextContent(/accessible/)
    await user.click(screen.getByRole('button', { name: 'View monthly counts' }))
    expect(screen.getByRole('table')).toHaveAccessibleName(
      'Patients by latest visit month · 1 assigned patient',
    )
    const copy = overviewCopy('assigned', 'Demo Clinician')
    expect(copy.basis).toBe('Assigned to Demo Clinician')
    expect(copy.patients(52)).toBe('52 assigned patients')
    expect(copy.patients(1)).toBe('1 assigned patient')
    expect(copy.unread(12)).toBe('12 unread comments across all patients')
    expect(copy.unread(1)).toBe('1 unread comment across all patients')
    expect(overviewCopy('assigned').basis).toBe('Assigned to you')
  })
})

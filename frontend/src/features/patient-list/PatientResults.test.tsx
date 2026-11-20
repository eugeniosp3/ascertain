import type { ReactNode } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientListItem } from '@/api/types'
import { useUIStore } from '@/app/ui-store'
import { getListView, rememberPatient, updateListView } from '@/app/view-state'
import { defaultListSearch } from './search-params'
import { patientListScope } from './scroll-restoration'
import PatientResults from './PatientResults'

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
const items = Array.from({ length: 100 }, (_, index) => patient(index))
const context = {
  actorId: 'actor-one',
  view: 'patients' as const,
  search: { ...defaultListSearch, page_size: 100 as const },
}

function renderWithRouter(children: ReactNode) {
  const root = createRootRoute({ component: Outlet })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => children })
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/patients/$patientId',
    component: () => <div>Patient workspace</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  useUIStore.setState({ returnSnapshots: {} })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(216)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(7000)
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement, value: number | ScrollToOptions, y?: number) {
      this.scrollTop = typeof value === 'number' ? (y ?? 0) : (value.top ?? this.scrollTop)
      this.dispatchEvent(new Event('scroll'))
    }),
  })
})
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  vi.unstubAllGlobals()
})

describe('virtualized patient results', () => {
  it('opens the overview when a plain table cell is clicked', async () => {
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    await screen.findByRole('table')
    const row = document.querySelector('[data-patient-id="p-0"]') as HTMLElement
    fireEvent.click(within(row).getByRole('cell', { name: '46' }))
    await screen.findByText('Patient workspace')
    expect(getListView('patients', 'actor-one')).toMatchObject({
      lastPatientId: 'p-0',
      triggerTab: 'overview',
      restoreFocus: true,
    })
  })
  it('leaves text selection and modified row clicks alone', async () => {
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    await screen.findByRole('table')
    const row = document.querySelector('[data-patient-id="p-0"]') as HTMLElement
    const age = within(row).getByRole('cell', { name: '46' })
    fireEvent.click(age, { ctrlKey: true })
    vi.spyOn(document, 'getSelection').mockReturnValue({
      toString: () => 'selected patient text',
    } as Selection)
    fireEvent.click(age)
    expect(screen.getByRole('table')).toBeVisible()
    expect(getListView('patients', 'actor-one').restoreFocus).toBe(false)
  })
  it('renders only visible rows and uses zero-count links for notes and discussion', async () => {
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    const table = await screen.findByRole('table')
    expect(table).toHaveAttribute('aria-rowcount', '101')
    const visibleRows = within(table).getAllByRole('row')
    expect(visibleRows.length).toBeGreaterThan(1)
    expect(visibleRows.length).toBeLessThan(25)
    expect(screen.queryByText('Patient 90 Example')).not.toBeInTheDocument()
    const notes = screen.getByRole('link', {
      name: 'Patient 0 Example, 0 clinical notes, open Notes',
    })
    expect(notes).toHaveAttribute('href', expect.stringContaining('tab=notes'))
    expect(notes).toHaveAttribute('href', expect.stringContaining('returnTo=patients'))
    expect(
      screen.getByRole('link', {
        name: 'Patient 0 Example, 0 comments, 0 unread comments, open Discussion',
      }),
    ).toHaveAttribute('href', expect.stringContaining('tab=discussion'))
    fireEvent.click(notes)
    expect(getListView('patients', 'actor-one')).toMatchObject({
      lastPatientId: 'p-0',
      triggerTab: 'notes',
      restoreFocus: true,
    })
  })
  it('converts the accessible Age sort to inverse server DOB order', async () => {
    const onChange = vi.fn()
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={onChange}
        onFocusHeading={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Sort by Age' }))
    expect(onChange).toHaveBeenCalledWith({ sort_by: 'dob', order: 'desc', page: 1 })
  })
  it('restores focus and the lilac marker to a previously offscreen record', async () => {
    updateListView('patients', 'actor-one', { scrollTop: 64 * 80 })
    rememberPatient('patients', 'actor-one', 'p-80', 80, 'discussion')
    const fallback = vi.fn()
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={fallback}
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('link', {
          name: 'Patient 80 Example, 0 comments, 0 unread comments, open Discussion',
        }),
      ).toHaveFocus(),
    )
    expect(document.querySelector('[data-patient-id="p-80"]')).toHaveClass('ac-last-visited')
    expect(fallback).not.toHaveBeenCalled()
  })
  it('moves keyboard focus between virtual rows using the same activity link', async () => {
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    const first = await screen.findByRole('link', {
      name: 'Patient 0 Example, 0 clinical notes, open Notes',
    })
    act(() => first.focus())
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Patient 1 Example, 0 clinical notes, open Notes' }),
      ).toHaveFocus(),
    )
  })
  it('focuses the next visible patient when the just-read queue record has disappeared', async () => {
    rememberPatient('notifications', 'actor-one', 'p-4', 4, 'discussion')
    const remaining = items.filter((patient) => patient.id !== 'p-4')
    renderWithRouter(
      <PatientResults
        items={remaining}
        total={99}
        busy={false}
        context={{ ...context, view: 'notifications' }}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('link', {
          name: 'Patient 5 Example, 0 comments, 0 unread comments, open Discussion',
        }),
      ).toHaveFocus(),
    )
  })
  it('renders mobile cards as the only active layout', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    const cards = await screen.findByRole('list', { name: 'Patients' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(cards).getAllByRole('listitem').length).toBeLessThan(15)
    expect(
      screen.getByRole('link', { name: 'Patient 0 Example, 0 clinical notes, open Notes' }),
    ).toBeInTheDocument()
    const card = document.querySelector('[data-patient-id="p-0"]') as HTMLElement
    fireEvent.click(card.querySelector('.ac-card-meta')!)
    await screen.findByText('Patient workspace')
    expect(getListView('patients', 'actor-one')).toMatchObject({
      lastPatientId: 'p-0',
      triggerTab: 'overview',
    })
  })
})

describe('measured origin integration', () => {
  // Layout stand-in: desktop rows are 64px below the 42px header, tops follow the scroller.
  function mockRowLayout() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const row = this.closest<HTMLElement>('[data-patient-id]')
      const scroller = this.closest<HTMLElement>('.ac-list-scroll')
      const rowTop =
        row && scroller ? 42 + Number(row.dataset.patientId!.slice(2)) * 64 - scroller.scrollTop : 0
      const top = row && row !== this ? rowTop + 22 : rowTop
      const height = !row ? 320 : row === this ? 64 : 20
      return { top, bottom: top + height, height, left: 0, right: 1000, width: 1000, x: 0, y: top }
    } as () => DOMRect)
  }

  it.each([
    { name: 'Patient 0 Example', tab: 'overview' },
    { name: 'Patient 0 Example, 0 clinical notes, open Notes', tab: 'notes' },
    {
      name: 'Patient 0 Example, 0 comments, 0 unread comments, open Discussion',
      tab: 'discussion',
    },
  ])('captures the actual origin from the table $tab link', async ({ name, tab }) => {
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('link', { name }))
    await screen.findByText('Patient workspace')
    expect(getListView('patients', 'actor-one')).toMatchObject({
      lastPatientId: 'p-0',
      triggerTab: tab,
      geometry: {
        scope: patientListScope('patients', 'actor-one', context.search, items, false),
        viewport: { width: 1000, height: 320 },
        scrollTop: 0,
        pin: 'top',
      },
    })
  })

  it('captures measured card sizes from the mobile origin link', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    fireEvent.click(
      await screen.findByRole('link', { name: 'Patient 0 Example, 0 clinical notes, open Notes' }),
    )
    await screen.findByText('Patient workspace')
    const geometry = getListView('patients', 'actor-one').geometry!
    expect(geometry.scope).toBe(
      patientListScope('patients', 'actor-one', context.search, items, true),
    )
    expect(geometry.measurements[0]).toMatchObject({ index: 0, key: 'p-0', size: 216 })
  })

  it('returns a clipped surviving origin to its measured offset without row alignment', async () => {
    mockRowLayout()
    // Row 80 spans 5162-5226px, so a 320px viewport at 4862px clips its bottom edge.
    const scrollTop = 4862
    rememberPatient('patients', 'actor-one', 'p-80', 80, 'notes', {
      scope: patientListScope('patients', 'actor-one', context.search, items, false),
      measurements: [],
      scrollTop,
      viewport: { width: 1000, height: 320 },
      rowTop: 300,
      actionTop: 322,
      pin: null,
    })
    const fallback = vi.fn()
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={fallback}
      />,
    )
    const action = await screen.findByRole('link', {
      name: 'Patient 80 Example, 0 clinical notes, open Notes',
    })
    await waitFor(() => expect(action).toHaveFocus())
    expect(document.querySelector<HTMLElement>('.ac-list-scroll')!.scrollTop).toBe(scrollTop)
    expect(action.closest('[data-patient-id]')!.getBoundingClientRect().top).toBe(300)
    expect(fallback).not.toHaveBeenCalled()
    expect(getListView('patients', 'actor-one').restoreFocus).toBe(false)
  })

  it('discards origin geometry measured for another scroller size', async () => {
    mockRowLayout()
    rememberPatient('patients', 'actor-one', 'p-80', 80, 'notes', {
      scope: patientListScope('patients', 'actor-one', context.search, items, false),
      measurements: [],
      scrollTop: 4862,
      viewport: { width: 640, height: 320 },
      rowTop: 300,
      actionTop: 322,
      pin: null,
    })
    renderWithRouter(
      <PatientResults
        items={items}
        total={100}
        busy={false}
        context={context}
        onChange={vi.fn()}
        onFocusHeading={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Patient 80 Example, 0 clinical notes, open Notes' }),
      ).toHaveFocus(),
    )
    expect(getListView('patients', 'actor-one').geometry).toBeNull()
  })
})

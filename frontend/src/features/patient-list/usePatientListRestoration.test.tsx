import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientListItem } from '@/api/types'
import { useUIStore } from '@/app/ui-store'
import { getListView, rememberPatient } from '@/app/view-state'
import { defaultListSearch } from './search-params'
import { capturePatientListGeometry, patientListScope } from './scroll-restoration'
import { usePatientListRestoration } from './usePatientListRestoration'

const items = Array.from({ length: 20 }, (_, index) => ({ id: `p-${index}` }) as PatientListItem)
const context = { actorId: 'one', view: 'patients' as const, search: defaultListSearch }
const heading = vi.fn()

function Fixture() {
  const { scrollRef, rowVirtualizer, linkContext } = usePatientListRestoration({
    items,
    context,
    isMobile: true,
    busy: false,
    onFocusHeading: heading,
  })
  return (
    <div ref={scrollRef} data-testid="scroller">
      {rowVirtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          ref={rowVirtualizer.measureElement}
          data-index={item.index}
          data-patient-id={items[item.index]!.id}
        >
          <a
            href="#"
            data-open-tab="notes"
            onClick={(event) => {
              event.preventDefault()
              rememberPatient(
                'patients',
                'one',
                items[item.index]!.id,
                item.index,
                'notes',
                linkContext.captureOrigin!(event.currentTarget),
              )
            }}
          >
            Notes {item.index}
          </a>
        </div>
      ))}
    </div>
  )
}

beforeEach(() => {
  useUIStore.setState({ returnSnapshots: {} })
  heading.mockClear()
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(195)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(198)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(3960)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = this.dataset.index
    const scroller = this.closest('[data-testid="scroller"]')
    const top = index === undefined ? 0 : Number(index) * 198 - (scroller?.scrollTop ?? 0)
    return {
      top,
      bottom: top + 198,
      height: 198,
      left: 0,
      right: 1000,
      width: 1000,
      x: 0,
      y: top,
      toJSON() {},
    }
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? this.scrollTop
      this.dispatchEvent(new Event('scroll'))
    }),
  })
})
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

describe('measured patient list restoration', () => {
  it('reuses measured sizes and focuses the clipped origin without full-row alignment', async () => {
    const scope = patientListScope('patients', 'one', defaultListSearch, items, true)
    rememberPatient('patients', 'one', 'p-4', 4, 'notes', {
      scope,
      measurements: items.map((item, index) => ({
        index,
        key: item.id,
        start: index * 198,
        end: (index + 1) * 198,
        size: 198,
        lane: 0,
      })),
      scrollTop: 700,
      viewport: { width: 1000, height: 195 },
      rowTop: 92,
      actionTop: 110,
      pin: null,
    })
    render(<Fixture />)
    const action = await screen.findByRole('link', { name: 'Notes 4' })
    await waitFor(() => expect(action).toHaveFocus())
    expect(screen.getByTestId('scroller').scrollTop).toBe(700)
    expect(action.closest('[data-patient-id]')!.getBoundingClientRect().top).toBe(92)
    expect(heading).not.toHaveBeenCalled()
    expect(getListView('patients', 'one').restoreFocus).toBe(false)
  })

  it('captures TanStack public measured sizes from the actual origin action', async () => {
    render(<Fixture />)
    const action = await screen.findByRole('link', { name: 'Notes 0' })
    fireEvent.click(action)
    const geometry = getListView('patients', 'one').geometry!
    expect(geometry.measurements.length).toBeGreaterThan(0)
    expect(geometry.measurements[0]).toMatchObject({ index: 0, key: 'p-0', size: 198 })
    const scroller = screen.getByTestId('scroller')
    expect(geometry).toEqual(
      capturePatientListGeometry(
        scroller,
        action as HTMLAnchorElement,
        geometry.scope,
        geometry.measurements,
      ),
    )
  })

  it('drops a stale seed when the scroller layout changed without a window resize', async () => {
    rememberPatient('patients', 'one', 'p-4', 4, 'notes', {
      scope: patientListScope('patients', 'one', defaultListSearch, items, true),
      measurements: items.map((item, index) => ({
        index,
        key: item.id,
        start: index * 500,
        end: (index + 1) * 500,
        size: 500,
        lane: 0,
      })),
      scrollTop: 700,
      viewport: { width: 500, height: 195 },
      rowTop: 92,
      actionTop: 110,
      pin: null,
    })
    render(<Fixture />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Notes 4' })).toHaveFocus())
    expect(getListView('patients', 'one').geometry).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Notes 4' }))
    const geometry = getListView('patients', 'one').geometry!
    expect(geometry.viewport.width).toBe(1000)
    expect(geometry.measurements.every((measurement) => measurement.size === 198)).toBe(true)
  })
})

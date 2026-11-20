import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientListItem } from '@/api/types'
import { defaultListSearch } from './search-params'
import {
  capturePatientListGeometry,
  matchesPatientListViewport,
  patientListAnchorOffset,
  patientListScope,
} from './scroll-restoration'

const items = [{ id: 'a', name: 'Example', notes_count: 0 }] as PatientListItem[]
function rect(top: number, height: number) {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 390,
    width: 390,
    x: 0,
    y: top,
    toJSON() {},
  }
}

function origin({ rowTop = 92, actionTop = 110, scrollTop = 700 } = {}) {
  const scroller = document.createElement('div')
  scroller.innerHTML = '<div data-patient-id="a"><a data-open-tab="overview">Open</a></div>'
  document.body.append(scroller)
  const row = scroller.firstElementChild as HTMLElement
  const action = row.firstElementChild as HTMLAnchorElement
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: 364 },
    clientHeight: { configurable: true, value: 195 },
    scrollHeight: { configurable: true, value: 4158 },
  })
  scroller.scrollTop = scrollTop
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(200, 195))
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(200 + rowTop, 198))
  vi.spyOn(action, 'getBoundingClientRect').mockReturnValue(rect(200 + actionTop, 18))
  const geometry = capturePatientListGeometry(scroller, action, 'scope', [])!
  return { scroller, row, action, geometry }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('patient list navigation geometry', () => {
  it('captures the real origin action in a clipped row without moving it', () => {
    const { scroller, geometry } = origin()
    expect(geometry).toMatchObject({ scrollTop: 700, rowTop: 92, actionTop: 110, pin: null })
    expect(scroller.scrollTop).toBe(700)
  })

  it.each([
    { original: 92, returned: -3, scrollTop: 795, expected: 700 },
    { original: -92, returned: -3, scrollTop: 597, expected: 686 },
    { original: 446, returned: 417, scrollTop: 329, expected: 300 },
  ])(
    'corrects visible anchor drift $scrollTop -> $expected',
    ({ original, returned, scrollTop, expected }) => {
      const { scroller, row, geometry } = origin({ rowTop: original })
      scroller.scrollTop = scrollTop
      vi.mocked(row.getBoundingClientRect).mockReturnValue(rect(200 + returned, 198))
      expect(patientListAnchorOffset(scroller, row, geometry)).toBe(expected)
    },
  )

  it('leaves an already correctly positioned clipped row unchanged', () => {
    const { scroller, row, geometry } = origin({ rowTop: -92, actionTop: 1, scrollTop: 686 })
    expect(patientListAnchorOffset(scroller, row, geometry)).toBe(686)
  })

  it('keeps top and end pinned even if virtual spacer heights change', () => {
    const { scroller, row, geometry } = origin({ scrollTop: 0 })
    scroller.scrollTop = 3
    expect(patientListAnchorOffset(scroller, row, geometry)).toBe(0)
    scroller.scrollTop = 3963
    const end = capturePatientListGeometry(scroller, scroller.querySelector('a')!, 'scope', [])!
    Object.defineProperty(scroller, 'scrollHeight', { value: 4194 })
    expect(patientListAnchorOffset(scroller, row, end)).toBe(3999)
  })

  it('rejects a foreign origin and detects changed scroller dimensions', () => {
    const { scroller, geometry } = origin()
    expect(
      capturePatientListGeometry(scroller, document.createElement('a'), 'scope', []),
    ).toBeNull()
    expect(matchesPatientListViewport(geometry, scroller)).toBe(true)
    Object.defineProperty(scroller, 'clientHeight', { value: 269 })
    expect(matchesPatientListViewport(geometry, scroller)).toBe(false)
  })

  it('scopes measurements to viewer, list, query, viewport and item content without retaining records', () => {
    const scope = () => patientListScope('patients', 'one', defaultListSearch, items, true)
    const saved = scope()
    expect(saved).not.toContain('Example')
    expect(patientListScope('patients', 'two', defaultListSearch, items, true)).not.toBe(saved)
    expect(patientListScope('notifications', 'one', defaultListSearch, items, true)).not.toBe(saved)
    expect(
      patientListScope('patients', 'one', { ...defaultListSearch, page: 2 }, items, true),
    ).not.toBe(saved)
    expect(
      patientListScope(
        'patients',
        'one',
        defaultListSearch,
        [{ ...items[0]!, notes_count: 1 }],
        true,
      ),
    ).not.toBe(saved)
    expect(patientListScope('patients', 'one', defaultListSearch, [], true)).not.toBe(saved)
    expect(patientListScope('patients', 'one', defaultListSearch, items, false)).not.toBe(saved)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375)
    expect(scope()).not.toBe(saved)
  })
})

import { describe, expect, it } from 'vitest'
import {
  aggregateAges,
  aggregateNotes,
  aggregateOverview,
  aggregateStatus,
  aggregateVisits,
  calendarDay,
  formatMonthTick,
  formatPercentage,
  niceAxisMax,
  recentVisits,
  visitWindow,
} from './aggregation'
import { makePatient } from './test-data'

describe('overview aggregations', () => {
  it('handles an empty population and an entirely active population without inventing a split', () => {
    const empty = aggregateOverview([], '2026-11-20')
    expect(empty.total).toBe(0)
    expect(empty.status.map((bucket) => bucket.count)).toEqual([0, 0])
    expect(empty.notes.totalNotes).toBe(0)
    expect(empty.visits.months).toHaveLength(12)
    expect(formatPercentage(0, 0)).toBe('0%')
    const patients = Array.from({ length: 100 }, (_, index) => makePatient(String(index)))
    expect(aggregateStatus(patients)).toEqual([
      { key: 'active', label: 'Active', count: 100 },
      { key: 'inactive', label: 'Inactive', count: 0 },
    ])
    expect(formatPercentage(100, 100)).toBe('100%')
  })

  it('uses API age at every inclusive age-band boundary, never deriving age from birth date', () => {
    const ages = [0, 17, 18, 39, 40, 59, 60, 79, 80, 103]
    const patients = ages.map((age, index) =>
      makePatient(String(index), { age, date_of_birth: '2000-01-01' }),
    )
    expect(aggregateAges(patients).map((bucket) => bucket.count)).toEqual([2, 2, 2, 2, 2])
  })

  it('identifies missing and invalid ages, statuses and note counts instead of calling them zero', () => {
    const patients = [-1, 1.5, NaN, Infinity, undefined].map((age, index) =>
      makePatient(String(index), { age, notes_count: age } as Partial<
        ReturnType<typeof makePatient>
      >),
    )
    expect(aggregateAges(patients).at(-1)).toMatchObject({ key: 'unknown', count: 5 })
    expect(aggregateNotes(patients).buckets.at(-1)).toMatchObject({ key: 'unknown', count: 5 })
    expect(aggregateNotes(patients).totalNotes).toBeNull()
    const unknownStatus = makePatient('unknown', { status: 'unexpected' as 'active' })
    expect(aggregateStatus([unknownStatus]).at(-1)).toMatchObject({ key: 'unknown', count: 1 })
  })

  it('counts patients with active clinical notes separately from the total number of notes', () => {
    const notes = aggregateNotes(
      [0, 1, 4].map((notes_count, index) => makePatient(String(index), { notes_count })),
    )
    expect(notes.buckets.map((bucket) => bucket.count)).toEqual([2, 1])
    expect(notes.totalNotes).toBe(5)
  })

  it('counts each latest visit once, with exact month boundaries and explicit outside categories', () => {
    const dates = [
      '2025-11-30',
      '2025-12-01',
      '2025-12-31',
      '2026-01-01',
      '2026-11-20',
      '2026-11-21',
      null,
      '2026-02-30',
      '2026-11-20T00:00:00Z',
    ]
    const result = aggregateVisits(
      dates.map((last_visit, index) => makePatient(String(index), { last_visit })),
      '2026-11-20',
    )
    expect(result.months[0]).toEqual({ key: '2025-12', label: 'Dec 2025', count: 2 })
    expect(result.months[1]?.count).toBe(1)
    expect(result.months.at(-1)).toMatchObject({ key: '2026-11', count: 1 })
    expect(result.outside).toEqual([
      { key: 'earlier', label: 'Earlier visits', count: 1 },
      { key: 'none', label: 'No visit recorded', count: 1 },
      { key: 'future', label: 'Future visit date', count: 1 },
      { key: 'unknown', label: 'Visit date unavailable', count: 2 },
    ])
    expect(
      [...result.months, ...result.outside].reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(dates.length)
  })

  it('compares calendar days consistently through DST and leap days', () => {
    expect(calendarDay('2026-03-09')! - calendarDay('2026-03-08')!).toBe(1)
    expect(calendarDay('2026-11-02')! - calendarDay('2026-11-01')!).toBe(1)
    expect(calendarDay('2024-03-01')! - calendarDay('2024-02-29')!).toBe(1)
    expect(calendarDay('2025-02-29')).toBeNull()
    expect(calendarDay('2026-13-01')).toBeNull()
    expect(calendarDay('0000-01-01')).toBeNull()
    expect(
      aggregateVisits([makePatient('leap', { last_visit: '2024-02-29' })], '2024-03-01').months.at(
        -2,
      )?.count,
    ).toBe(1)
    expect(() => aggregateVisits([], 'invalid')).toThrow(RangeError)
  })

  it('preserves the full denominator in every distribution, including unavailable values', () => {
    const patients = [
      makePatient('active', { age: 80, notes_count: 2, last_visit: '2026-11-01' }),
      makePatient('inactive', { status: 'inactive', age: 17, last_visit: '2020-01-01' }),
      makePatient('unknown', { age: NaN, notes_count: NaN, last_visit: 'invalid' }),
      makePatient('future', { last_visit: '2027-01-01' }),
    ]
    const result = aggregateOverview(patients, '2026-11-20')
    for (const distribution of [
      result.status,
      result.ages,
      result.notes.buckets,
      [...result.visits.months, ...result.visits.outside],
    ]) {
      expect(distribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(patients.length)
    }
  })

  it('reuses the projection for recent visits, excluding future and invalid dates without mutation', () => {
    const patients = [
      makePatient('older', { last_visit: '2026-10-31' }),
      makePatient('future', { last_visit: '2026-11-21' }),
      makePatient('today', { last_visit: '2026-11-20' }),
      makePatient('bad', { last_visit: 'not-a-date' }),
      makePatient('missing'),
    ]
    expect(recentVisits(patients, '2026-11-20', 2).map((patient) => patient.id)).toEqual([
      'today',
      'older',
    ])
    expect(patients[0]?.id).toBe('older')
  })

  it('narrows the visit window locally while keeping every patient in the denominator', () => {
    const visits = aggregateVisits(
      ['2025-10-01', '2025-12-15', '2026-05-31', '2026-06-01', '2026-11-20', null].map(
        (last_visit, index) => makePatient(String(index), { last_visit }),
      ),
      '2026-11-20',
    )
    const six = visitWindow(visits, 6)
    expect(six.months.map((month) => month.key)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    expect(six.outside[0]).toEqual({ key: 'earlier', label: 'Before Jun 2026', count: 3 })
    expect([...six.months, ...six.outside].reduce((sum, bucket) => sum + bucket.count, 0)).toBe(6)
    const twelve = visitWindow(visits, 12)
    expect(twelve.outside[0]).toMatchObject({ label: 'Before Dec 2025', count: 1 })
    // The aggregate itself is not mutated by windowing.
    expect(visits.outside[0]).toEqual({ key: 'earlier', label: 'Earlier visits', count: 1 })
  })

  it('chooses readable integer axis ceilings and compact month ticks', () => {
    expect([0, 1, 2, 3, 9, 10, 41, 100, 1234].map(niceAxisMax)).toEqual([
      2, 2, 2, 4, 10, 10, 60, 100, 1600,
    ])
    expect(formatMonthTick('2026-01', true)).toBe('Jan ’26')
    expect(formatMonthTick('2025-12', false)).toBe('Dec')
  })

  it('moves the partial month and the future boundary exactly at the UTC month change', () => {
    const patients = ['2026-11-30', '2026-12-01', null, 'not-a-date'].map((last_visit, index) =>
      makePatient(String(index), { last_visit }),
    )
    const lastNovember = aggregateVisits(patients, '2026-11-30')
    expect(lastNovember.months.at(-1)).toMatchObject({ key: '2026-11', count: 1 })
    expect(lastNovember.outside.find((bucket) => bucket.key === 'future')?.count).toBe(1)
    const firstDecember = aggregateVisits(patients, '2026-12-01')
    // On Dec 1 (UTC) November is complete and December is the running month.
    expect(firstDecember.months.at(-2)).toMatchObject({ key: '2026-11', count: 1 })
    expect(firstDecember.months.at(-1)).toMatchObject({ key: '2026-12', count: 1 })
    expect(firstDecember.outside.find((bucket) => bucket.key === 'future')).toBeUndefined()
    expect(firstDecember.outside.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ['earlier', 0],
      ['none', 1],
      ['unknown', 1],
    ])
  })
})

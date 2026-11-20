import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatDateTime, toDateTimeLocal, toIsoTimestamp } from './dates'

afterEach(() => vi.useRealTimers())

describe('dates', () => {
  it('formats date-only values without shifting a day in the viewer timezone', () => {
    expect(formatDate('1948-05-10')).toBe('May 10, 1948')
    expect(formatDate('2024-02-29')).toBe('Feb 29, 2024')
    expect(formatDate(null)).toBe('Not recorded')
  })

  it.each(['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '11/20/2026'])(
    'rejects invalid calendar input %s',
    (value) => expect(() => formatDate(value)).toThrow(RangeError),
  )

  it('converts a local input to the same local calendar time and a UTC instant', () => {
    const input = '2026-07-04T14:35'
    const iso = toIsoTimestamp(input)
    const expected = new Date(2026, 6, 4, 14, 35).toISOString()
    expect(iso).toBe(expected)
    expect(toDateTimeLocal(iso)).toBe(input)
    expect(formatDateTime(iso)).toContain('Jul 4, 2026')
  })

  it('defaults local input to now and shows timestamps in the viewer timezone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T18:35:12Z'))
    expect(toDateTimeLocal()).toBe(toDateTimeLocal('2026-11-20T18:35:12Z'))
    expect(formatDateTime('2026-11-20T18:35:12Z')).toBe(
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(new Date('2026-11-20T18:35:12Z')),
    )
  })

  it.each([
    '',
    '2026-02-30T14:00',
    '2026-11-20T25:00',
    '2026-11-20T12:60',
    '2026-11-20',
    '2026-11-20T12:00Z',
  ])('rejects invalid local datetime %s', (value) =>
    expect(() => toIsoTimestamp(value)).toThrow(RangeError),
  )

  it('rejects timezone-less instants and invalid rolled-over dates', () => {
    expect(() => formatDateTime('2026-11-20T12:00')).toThrow(RangeError)
    expect(() => toDateTimeLocal('2026-02-30T12:00:00Z')).toThrow(RangeError)
    expect(() => formatDateTime('2026-11-20T24:00:00Z')).toThrow(RangeError)
  })

  it('accepts the microsecond precision commonly emitted by Python APIs', () => {
    expect(toDateTimeLocal('2026-11-20T18:35:12.123456Z')).toBe(
      toDateTimeLocal('2026-11-20T18:35:12.123Z'),
    )
    expect(formatDateTime('2026-11-20T18:35:12.123456Z')).toBe(
      formatDateTime('2026-11-20T18:35:12.123Z'),
    )
  })

  it('rejects nonexistent local DST times when the test timezone has a spring gap', () => {
    const skipped = new Date(2026, 2, 8, 2, 30)
    if (skipped.getHours() !== 2)
      expect(() => toIsoTimestamp('2026-03-08T02:30')).toThrow(RangeError)
    else expect(toDateTimeLocal(toIsoTimestamp('2026-03-08T02:30'))).toBe('2026-03-08T02:30')
  })
})

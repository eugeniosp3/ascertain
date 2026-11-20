import type { PatientListItem } from '@/api/types'

export interface DistributionBucket {
  key: string
  label: string
  count: number
}

function buckets(definitions: ReadonlyArray<readonly [string, string]>): DistributionBucket[] {
  return definitions.map(([key, label]) => ({ key, label, count: 0 }))
}

function increment(distribution: DistributionBucket[], key: string) {
  distribution.find((bucket) => bucket.key === key)!.count += 1
}

function omitEmptyUnknown(distribution: DistributionBucket[]) {
  return distribution.filter((bucket) => bucket.key !== 'unknown' || bucket.count > 0)
}

/** Calendar dates are parsed and compared at UTC midnight, without local-zone conversion. */
export function calendarDay(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  return date.getTime() / 86_400_000
}

export function aggregateStatus(patients: readonly PatientListItem[]) {
  const distribution = buckets([
    ['active', 'Active'],
    ['inactive', 'Inactive'],
    ['unknown', 'Status unavailable'],
  ])
  for (const patient of patients) {
    increment(
      distribution,
      patient.status === 'active' || patient.status === 'inactive' ? patient.status : 'unknown',
    )
  }
  return omitEmptyUnknown(distribution)
}

export function aggregateAges(patients: readonly PatientListItem[]) {
  const distribution = buckets([
    ['0-17', '0–17'],
    ['18-39', '18–39'],
    ['40-59', '40–59'],
    ['60-79', '60–79'],
    ['80+', '80+'],
    ['unknown', 'Age unavailable'],
  ])
  for (const { age } of patients) {
    const key =
      !Number.isSafeInteger(age) || age < 0
        ? 'unknown'
        : age < 18
          ? '0-17'
          : age < 40
            ? '18-39'
            : age < 60
              ? '40-59'
              : age < 80
                ? '60-79'
                : '80+'
    increment(distribution, key)
  }
  return omitEmptyUnknown(distribution)
}

export function aggregateVisits(patients: readonly PatientListItem[], asOfDate: string) {
  const referenceDay = calendarDay(asOfDate)
  if (referenceDay === null) throw new RangeError('A valid reference date is required.')
  const referenceMonth = Number(asOfDate.slice(0, 4)) * 12 + Number(asOfDate.slice(5, 7)) - 1
  const firstMonth = referenceMonth - 11
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = firstMonth + index
    const key = `${String(Math.floor(month / 12)).padStart(4, '0')}-${String((month % 12) + 1).padStart(2, '0')}`
    return { key, label: formatMonth(key), count: 0 }
  })
  const outside = buckets([
    ['earlier', 'Earlier visits'],
    ['none', 'No visit recorded'],
    ['future', 'Future visit date'],
    ['unknown', 'Visit date unavailable'],
  ])
  for (const { last_visit } of patients) {
    const visitDay = calendarDay(last_visit)
    if (last_visit === null) increment(outside, 'none')
    else if (visitDay === null) increment(outside, 'unknown')
    else if (visitDay > referenceDay) increment(outside, 'future')
    else {
      const month = Number(last_visit.slice(0, 4)) * 12 + Number(last_visit.slice(5, 7)) - 1
      if (month < firstMonth) increment(outside, 'earlier')
      else months[month - firstMonth]!.count += 1
    }
  }
  return {
    months,
    outside: omitEmptyUnknown(outside).filter(
      (bucket) => bucket.key !== 'future' || bucket.count > 0,
    ),
  }
}

export function aggregateNotes(patients: readonly PatientListItem[]) {
  const distribution = buckets([
    ['with-notes', 'With clinical notes'],
    ['without-notes', 'No clinical notes'],
    ['unknown', 'Note count unavailable'],
  ])
  let totalNotes = 0
  for (const { notes_count } of patients) {
    const valid = Number.isSafeInteger(notes_count) && notes_count >= 0
    increment(distribution, valid ? (notes_count > 0 ? 'with-notes' : 'without-notes') : 'unknown')
    if (valid) totalNotes += notes_count
  }
  return {
    buckets: omitEmptyUnknown(distribution),
    totalNotes:
      distribution.find((bucket) => bucket.key === 'unknown')!.count === 0 &&
      Number.isSafeInteger(totalNotes)
        ? totalNotes
        : null,
  }
}

export function aggregateOverview(patients: readonly PatientListItem[], asOfDate: string) {
  return {
    total: patients.length,
    status: aggregateStatus(patients),
    ages: aggregateAges(patients),
    visits: aggregateVisits(patients, asOfDate),
    notes: aggregateNotes(patients),
    asOfDate,
  }
}

export type OverviewSummary = ReturnType<typeof aggregateOverview>

export function percentage(count: number, total: number) {
  return total === 0 ? 0 : (count / total) * 100
}

const counts = new Intl.NumberFormat('en-US')
const percentages = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const monthLabels = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
export function formatMonth(month: string) {
  const date = new Date(0)
  date.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
  return monthLabels.format(date)
}
export const formatCount = (value: number) => counts.format(value)
export const formatPercentage = (count: number, total: number) =>
  `${percentages.format(percentage(count, total))}%`

export type VisitRange = 6 | 12

/**
 * Narrow the 12-month latest-visit series to a local display window without re-aggregating.
 * Months that fall out of the window move into the "before" bucket, so the denominator stays whole.
 */
export function visitWindow(visits: OverviewSummary['visits'], range: VisitRange) {
  const months = visits.months.slice(-range)
  const dropped = visits.months
    .slice(0, visits.months.length - months.length)
    .reduce((sum, month) => sum + month.count, 0)
  const outside = visits.outside.map((bucket) =>
    bucket.key === 'earlier'
      ? { ...bucket, label: `Before ${months[0]!.label}`, count: bucket.count + dropped }
      : bucket,
  )
  return { months, outside }
}

/** A readable integer axis ceiling with an integer midpoint: 9 → 10, 41 → 60, 0 → 2. */
export function niceAxisMax(max: number) {
  const half = Math.max(1, Math.ceil(max / 2))
  const magnitude = 10 ** Math.floor(Math.log10(half))
  const step = [1, 2, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((value) => value >= half)!
  return step * 2
}

const shortMonths = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
/** Axis tick text for a `YYYY-MM` key; the two-digit year is added only where context needs it. */
export function formatMonthTick(month: string, withYear: boolean) {
  const date = new Date(0)
  date.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
  const name = shortMonths.format(date)
  return withYear ? `${name} ’${month.slice(2, 4)}` : name
}

/** Reuse the complete projection for the existing recent-visits list, too. */
export function recentVisits(patients: readonly PatientListItem[], asOfDate: string, limit = 5) {
  const referenceDay = calendarDay(asOfDate)
  return patients
    .filter((patient) => {
      const day = calendarDay(patient.last_visit)
      return day !== null && referenceDay !== null && day <= referenceDay
    })
    .sort((a, b) => b.last_visit!.localeCompare(a.last_visit!) || a.id.localeCompare(b.id))
    .slice(0, limit)
}

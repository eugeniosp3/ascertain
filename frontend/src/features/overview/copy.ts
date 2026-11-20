import { formatNumber } from './aggregation'
import type { OverviewProjection } from './projection'

/**
 * Whose patients the Overview counts: the cohort the loaded projection declares. Today that is only
 * the selected user's persisted assignments (`assigned_to=me`); a new projection scope must get its
 * own wording here, so labels always describe the data actually loaded.
 */
export type OverviewScope = OverviewProjection['scope']

export interface OverviewCopy {
  /** Region heading, which also names the region for assistive technology. */
  heading: string
  /** One line stating which patients are counted. */
  basis: string
  /** Patient total for the page summary and the chart data table. */
  patients: (count: number) => string
  /**
   * Unread comments are per viewer across all patients (the bell), never scoped to the cohort,
   * so the line says so explicitly.
   */
  unread: (count: number) => string
  empty: string
  loading: string
  refreshing: string
  loadFailed: string
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`

/** `displayName` is the selected user's display name, shown verbatim ("Assigned to <name>"). */
export function overviewCopy(scope: OverviewScope, displayName?: string): OverviewCopy {
  switch (scope) {
    case 'assigned':
      return {
        heading: 'Your patients',
        basis: `Assigned to ${displayName || 'you'}`,
        patients: (count) => plural(count, 'assigned patient'),
        unread: (count) => `${plural(count, 'unread comment')} across all patients`,
        empty: 'No patients are assigned to you yet. Charts show zero patients.',
        loading: 'Loading your assigned patients…',
        refreshing: 'Refreshing your assigned patients…',
        loadFailed:
          'Your assigned patients couldn’t be loaded completely. No partial totals are shown.',
      }
  }
}

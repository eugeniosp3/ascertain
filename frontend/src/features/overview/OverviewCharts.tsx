import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/utils/dates'
import { formatCount, formatPercentage, percentage, type OverviewSummary } from './aggregation'
import { LatestVisitsChart } from './LatestVisitsChart'
import type { OverviewCopy } from './copy'
import { ChartCard, DistributionLegend, MetricValue, ProportionBar } from './ChartPrimitives'
import './overview.css'

function StatusChart({ summary }: { summary: OverviewSummary }) {
  const active = summary.status.find((bucket) => bucket.key === 'active')?.count ?? 0
  return (
    <ChartCard title="Patient status" className="ac-chart-status">
      <MetricValue value={formatCount(active)} label={`active of ${formatCount(summary.total)}`} />
      <ProportionBar buckets={summary.status} palette="status" />
      <DistributionLegend buckets={summary.status} total={summary.total} />
    </ChartCard>
  )
}

function NotesChart({ summary }: { summary: OverviewSummary }) {
  const { buckets, totalNotes } = summary.notes
  return (
    <ChartCard
      title="Clinical-note coverage"
      className="ac-chart-notes"
      meta={
        totalNotes === null
          ? 'Note total unavailable'
          : `${formatCount(totalNotes)} active ${totalNotes === 1 ? 'note' : 'notes'} in total`
      }
    >
      <MetricValue
        value={formatPercentage(buckets[0]!.count, summary.total)}
        label="have ≥1 active note"
      />
      <ProportionBar buckets={buckets} palette="notes" />
      <DistributionLegend buckets={buckets} total={summary.total} palette="notes" />
    </ChartCard>
  )
}

function AgeChart({ summary }: { summary: OverviewSummary }) {
  // Bars share one zero-based scale whose end is the largest band; exact counts sit beside each.
  const largest = Math.max(1, ...summary.ages.map((bucket) => bucket.count))
  return (
    <ChartCard title="Age bands" meta="Years" className="ac-chart-ages">
      <ul className="ac-chart-bars">
        {summary.ages.map((bucket) => (
          <li key={bucket.key} data-unknown={bucket.key === 'unknown' || undefined}>
            <span className="ac-chart-bar-label">{bucket.label}</span>
            <span className="ac-chart-bar-track" aria-hidden="true">
              <span style={{ width: `${percentage(bucket.count, largest)}%` }} />
            </span>
            <span className="ac-chart-values">
              <strong>{formatCount(bucket.count)}</strong>
              <span className="sr-only"> of {formatCount(summary.total)} patients, </span>
              <span>{formatPercentage(bucket.count, summary.total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}

const loadingCards = [
  ['Patient status', 'ac-chart-status'],
  ['Clinical-note coverage', 'ac-chart-notes'],
  ['Age bands', 'ac-chart-ages'],
  ['Latest recorded visit', 'ac-visits'],
] as const

export function OverviewCharts({
  summary,
  isFetching,
  isError,
  updatedAt,
  onRetry,
  copy,
}: {
  summary: OverviewSummary | undefined
  isFetching: boolean
  isError: boolean
  updatedAt: number
  onRetry: () => void
  /** Wording for the cohort the projection declares (see `overviewCopy`). */
  copy: OverviewCopy
}) {
  return (
    <section className="ac-population" aria-labelledby="population-title">
      <div className="ac-population-heading">
        <h2 id="population-title">{copy.heading}</h2>
        <p>{copy.basis}</p>
        {summary && (
          <p
            className="ac-chart-updated"
            title={
              updatedAt > 0
                ? `Last complete refresh: ${formatDateTime(new Date(updatedAt).toISOString())}`
                : undefined
            }
          >
            As of <time dateTime={summary.asOfDate}>{formatDate(summary.asOfDate)}</time> (UTC)
          </p>
        )}
      </div>
      {isError && (
        <div className="ac-chart-notice" role="alert">
          <p>{summary ? 'Refresh failed. Showing the last complete overview.' : copy.loadFailed}</p>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isFetching}>
            Retry overview
          </Button>
        </div>
      )}
      <p className="ac-chart-query-status" role="status">
        {isFetching
          ? summary
            ? copy.refreshing
            : copy.loading
          : summary?.total === 0
            ? copy.empty
            : null}
      </p>
      {summary ? (
        <div className="ac-chart-grid">
          <StatusChart summary={summary} />
          <NotesChart summary={summary} />
          <AgeChart summary={summary} />
          <LatestVisitsChart
            visits={summary.visits}
            total={summary.total}
            denominator={copy.patients(summary.total)}
          />
        </div>
      ) : !isError ? (
        <div className="ac-chart-grid" aria-hidden="true">
          {loadingCards.map(([title, className]) => (
            <div className={`ac-chart-card ac-chart-loading ${className}`} key={title}>
              <h3>{title}</h3>
              <div />
              <div />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

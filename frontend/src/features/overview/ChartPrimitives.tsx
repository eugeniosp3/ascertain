import { useId, type ReactNode } from 'react'
import { formatCount, formatPercentage, type DistributionBucket } from './aggregation'

export type ChartPalette = 'status' | 'notes' | 'visits'

/**
 * Compact dashboard card: one header row (title, quiet meta, local controls), then the chart.
 * The figure is named by its title so tests and assistive technology can address each chart.
 */
export function ChartCard({
  title,
  meta,
  actions,
  caption,
  className,
  children,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  caption?: ReactNode
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <figure className={`ac-chart-card${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <div className="ac-chart-heading">
        <h3 id={id}>{title}</h3>
        {meta && <p className="ac-chart-meta">{meta}</p>}
        {actions && <div className="ac-chart-actions">{actions}</div>}
      </div>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** The single headline number of a card, with its unit or denominator spelled out beside it. */
export function MetricValue({ value, label }: { value: string; label: ReactNode }) {
  return (
    <p className="ac-metric">
      <strong>{value}</strong> <span>{label}</span>
    </p>
  )
}

/**
 * Part-to-whole bar. Segment widths come from flex-grow so gaps never distort proportions,
 * and empty segments are omitted rather than drawn as slivers. An empty total keeps only the track.
 */
export function ProportionBar({
  buckets,
  palette,
}: {
  buckets: DistributionBucket[]
  palette: ChartPalette
}) {
  return (
    <div className="ac-proportion" data-palette={palette} aria-hidden="true">
      {buckets.map((bucket, index) =>
        bucket.count > 0 ? (
          <span
            key={bucket.key}
            className={`ac-chart-color-${index}`}
            style={{ flexGrow: bucket.count }}
          />
        ) : null,
      )}
    </div>
  )
}

export function DistributionLegend({
  buckets,
  total,
  palette = 'status',
  inline = false,
}: {
  buckets: DistributionBucket[]
  total: number
  palette?: ChartPalette
  inline?: boolean
}) {
  return (
    <ul className="ac-chart-legend" data-palette={palette} data-inline={inline || undefined}>
      {buckets.map((bucket, index) => (
        <li key={bucket.key}>
          <span className="ac-chart-legend-label">
            <span className={`ac-chart-swatch ac-chart-color-${index}`} aria-hidden="true" />
            {bucket.label}
          </span>
          <span className="ac-chart-values">
            <strong>{formatCount(bucket.count)}</strong>
            <span className="sr-only"> of {formatCount(total)} patients, </span>
            <span>{formatPercentage(bucket.count, total)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

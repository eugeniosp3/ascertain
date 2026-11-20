import { useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import {
  formatCount,
  formatMonthTick,
  formatPercentage,
  niceAxisMax,
  visitWindow,
  type OverviewSummary,
  type VisitRange,
} from './aggregation'
import { ChartCard, DistributionLegend } from './ChartPrimitives'

const ranges: readonly VisitRange[] = [6, 12]

/**
 * Patients grouped by the month of their most recent recorded visit (one point per patient,
 * never total appointments). The plot is drawn in percentage space: the SVG path stretches with
 * non-scaling strokes while points, guide, tooltip and ticks are HTML positioned by the same
 * percentages, so markers stay round at any width without measuring the DOM.
 *
 * The last month is the current, still-running calendar month (UTC reference date). It is drawn
 * as a dashed segment ending in a hollow marker, and inspection starts on the last complete
 * month, so an incomplete count never reads as a completed-period drop.
 */
export function LatestVisitsChart({
  visits,
  total,
  denominator,
}: {
  visits: OverviewSummary['visits']
  total: number
  /** Who the total counts, e.g. "48 assigned patients". */
  denominator: string
}) {
  const [range, setRange] = useState<VisitRange>(12)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [showTable, setShowTable] = useState(false)
  const id = useId()
  const area = useRef<HTMLDivElement>(null)
  const { months, outside } = useMemo(() => visitWindow(visits, range), [visits, range])
  const axisMax = useMemo(() => niceAxisMax(Math.max(...months.map((m) => m.count))), [months])
  const points = useMemo(
    () =>
      months.map((month, index) => ({
        ...month,
        x: (index / (months.length - 1)) * 100,
        y: 100 - (month.count / axisMax) * 100,
      })),
    [months, axisMax],
  )
  const partialIndex = points.length - 1
  const lastComplete = points[partialIndex - 1]!
  const current = points[partialIndex]!
  const found = points.findIndex((point) => point.key === selectedMonth)
  const activeIndex = found === -1 ? partialIndex - 1 : found
  const active = points[activeIndex]!
  const activePartial = activeIndex === partialIndex
  const monthName = (label: string, partial: boolean) => (partial ? `${label} (partial)` : label)
  const valueText = `${monthName(active.label, activePartial)}: ${formatCount(active.count)} of ${formatCount(total)} patients (${formatPercentage(active.count, total)})`
  // Complete months form the solid line and its fill; the running month is a separate dashed leg.
  const line = points
    .slice(0, partialIndex)
    .map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ')
  const partialLine = `M${lastComplete.x},${lastComplete.y} L${current.x},${current.y}`
  const empty = months.every((month) => month.count === 0)
  // Narrow cards label every third month of the 12-month axis, anchored on the current month.
  const sparse = (index: number) => months.length > 6 && (months.length - 1 - index) % 3 !== 0
  const firstDense = months.findIndex((_, index) => !sparse(index))

  function inspect(event: PointerEvent<HTMLDivElement>) {
    const bounds = area.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0) return
    const ratio = (event.clientX - bounds.left) / bounds.width
    const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))))
    setSelectedMonth(points[index]!.key)
  }

  return (
    <ChartCard
      title="Latest recorded visit"
      meta="Patients by month"
      className="ac-visits"
      actions={
        <div className="ac-chart-range" role="group" aria-label="Months shown">
          {ranges.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {value} months
            </button>
          ))}
        </div>
      }
      caption={
        <>
          Each patient counted once, by most recent recorded visit — not total appointments.{' '}
          <span className="ac-visits-partial-key" aria-hidden="true" />
          {visits.months.at(-1)!.label} is partial.
        </>
      }
    >
      <div className="ac-visits-chart">
        <div
          className="ac-visits-y"
          aria-hidden="true"
          style={{ width: `${formatCount(axisMax).length + 0.5}ch` }}
        >
          <span style={{ top: '0%' }}>{formatCount(axisMax)}</span>
          <span style={{ top: '50%' }}>{formatCount(axisMax / 2)}</span>
          <span style={{ top: '100%' }}>0</span>
        </div>
        <div className="ac-visits-plot" onPointerMove={inspect} onPointerDown={inspect}>
          <div className="ac-visits-area" ref={area}>
            <span className="ac-visits-grid" style={{ top: '0%' }} />
            <span className="ac-visits-grid" style={{ top: '50%' }} />
            <span className="ac-visits-grid ac-visits-baseline" style={{ top: '100%' }} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path className="ac-visits-fill" d={`${line} L${lastComplete.x},100 L0,100 Z`} />
              <path className="ac-visits-line" d={line} />
              <path className="ac-visits-line ac-visits-partial" d={partialLine} />
            </svg>
            <span className="ac-visits-guide" style={{ left: `${active.x}%` }} />
            {points.map((point, index) => (
              <span
                key={point.key}
                className="ac-visits-point"
                data-active={index === activeIndex || undefined}
                data-partial={index === partialIndex || undefined}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            ))}
            <div
              className="ac-visits-tip"
              aria-hidden="true"
              style={{ left: `${active.x}%`, transform: `translateX(-${active.x}%)` }}
            >
              <span>{monthName(active.label, activePartial)}</span>
              <strong>{formatCount(active.count)}</strong>
              <span>
                {active.count === 1 ? 'patient' : 'patients'} ·{' '}
                {formatPercentage(active.count, total)}
              </span>
            </div>
            {empty && <p className="ac-visits-empty">No latest visits recorded in these months.</p>}
          </div>
          <input
            // Pointer inspection belongs to the plot; the native range gives keyboard and AT control.
            className="ac-visits-input"
            id={`${id}-month`}
            aria-label="Inspect month, use arrow keys"
            type="range"
            min="0"
            max={points.length - 1}
            step="1"
            value={activeIndex}
            aria-valuetext={valueText}
            onChange={(event) => setSelectedMonth(points[Number(event.target.value)]!.key)}
          />
        </div>
        <ol className="ac-visits-x" aria-hidden="true">
          {points.map((point, index) => (
            <li
              key={point.key}
              data-sparse-hidden={sparse(index) || undefined}
              data-active={index === activeIndex || undefined}
              data-partial={index === partialIndex || undefined}
              style={{ left: `${point.x}%`, transform: `translateX(-${point.x}%)` }}
            >
              <span data-year="dense">
                {formatMonthTick(point.key, index === 0 || point.key.endsWith('-01'))}
              </span>
              <span data-year="sparse">
                {formatMonthTick(point.key, index === firstDense || point.key.endsWith('-01'))}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="ac-visits-footer">
        <DistributionLegend buckets={outside} total={total} palette="visits" inline />
        <button
          type="button"
          className="ac-chart-data-toggle"
          aria-expanded={showTable}
          aria-controls={`${id}-table`}
          onClick={() => setShowTable((open) => !open)}
        >
          View monthly counts
        </button>
      </div>
      <div className="ac-chart-data" id={`${id}-table`} hidden={!showTable}>
        <table>
          <caption>Patients by latest visit month · {denominator}</caption>
          <thead>
            <tr>
              <th scope="col">Month / category</th>
              <th scope="col">Patients</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {[...months, ...outside].map((bucket) => (
              <tr key={bucket.key}>
                <th scope="row">{monthName(bucket.label, bucket.key === current.key)}</th>
                <td>{formatCount(bucket.count)}</td>
                <td>{formatPercentage(bucket.count, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}

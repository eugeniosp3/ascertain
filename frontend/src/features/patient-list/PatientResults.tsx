import { useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import type { PatientListItem } from '@/api/types'
import { updateListView } from '@/app/view-state'
import { StatusPill } from '@/components/ui/status-pill'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useMediaQuery } from '@/hooks/use-media-query'
import { formatDate } from '@/utils/dates'
import { PatientActivity } from './PatientActivity'
import { PatientIdentity } from './PatientIdentity'
import type { PatientLinkContext } from './PatientOpenLink'
import { usePatientListRestoration } from './usePatientListRestoration'
import { searchForSorting, tableSorting, type ListSearch } from './search-params'

interface PatientResultsProps {
  items: PatientListItem[]
  total: number
  busy: boolean
  context: PatientLinkContext
  onChange: (patch: Partial<ListSearch>) => void
  onFocusHeading: () => void
}

/** Use the existing overview link so row/card clicks share navigation and return-state behavior. */
function openPatientRow(event: MouseEvent<HTMLElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return
  const target = event.target
  if (!(target instanceof Element)) return
  if (
    target.closest(
      'a, button, input, select, textarea, label, [role="button"], [role="link"], [role="checkbox"], [contenteditable="true"]',
    )
  )
    return
  if (event.currentTarget.ownerDocument.getSelection()?.toString()) return
  event.currentTarget.querySelector<HTMLAnchorElement>('a[data-open-tab="overview"]')?.click()
}

export default function PatientResults({
  items,
  total,
  busy,
  context,
  onChange,
  onFocusHeading,
}: PatientResultsProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const showConditions = useMediaQuery('(min-width: 1280px)')
  const { scrollRef, saved, rowVirtualizer, linkContext, focusRow } = usePatientListRestoration({
    items,
    context,
    isMobile,
    busy,
    onFocusHeading,
  })
  // Memoization: reuse column definitions until the patient-link context changes.
  const columns = useMemo<ColumnDef<PatientListItem>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Patient',
        cell: ({ row }) => (
          <PatientIdentity patient={row.original} index={row.index} context={linkContext} />
        ),
      },
      {
        id: 'age',
        accessorKey: 'age',
        header: 'Age',
        cell: ({ row }) => <span className="ac-number">{row.original.age}</span>,
      },
      {
        id: 'last_visit',
        accessorKey: 'last_visit',
        header: 'Last visit',
        cell: ({ row }) => (
          <span className={row.original.last_visit ? 'ac-number' : 'ac-muted'}>
            {row.original.last_visit ? formatDate(row.original.last_visit) : 'No visit recorded'}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'conditions',
        header: 'Conditions',
        enableSorting: false,
        cell: ({ row }) => {
          const conditions = row.original.conditions
          return conditions.length ? (
            <div
              className="ac-condition"
              title={conditions.map((condition) => condition.label).join(', ')}
            >
              <span>{conditions[0]?.label}</span>
              {conditions.length > 1 && (
                <span className="ac-condition-more">+{conditions.length - 1}</span>
              )}
            </div>
          ) : (
            <span className="ac-muted">None recorded</span>
          )
        },
      },
      {
        id: 'notes_count',
        accessorKey: 'notes_count',
        header: 'Clinical notes',
        cell: ({ row }) => (
          <PatientActivity
            patient={row.original}
            index={row.index}
            context={linkContext}
            kind="notes"
          />
        ),
      },
      {
        id: 'comments_count',
        accessorKey: 'comments_count',
        header: 'Conversation',
        cell: ({ row }) => (
          <PatientActivity
            patient={row.original}
            index={row.index}
            context={linkContext}
            kind="discussion"
          />
        ),
      },
    ],
    [linkContext],
  )
  // Server-driven table: the API filters, sorts and pages; Table manages column and UI state.
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is used outside the React Compiler.
  const table = useReactTable({
    data: items,
    columns,
    getRowId: (patient) => patient.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: total,
    enableSortingRemoval: false,
    state: {
      sorting: tableSorting(context.search),
      columnVisibility: { conditions: showConditions },
      pagination: { pageIndex: context.search.page - 1, pageSize: context.search.page_size },
    },
    onSortingChange: (updater) =>
      onChange(searchForSorting(functionalUpdate(updater, tableSorting(context.search)))),
    defaultColumn: { sortDescFirst: false },
  })
  const rows = table.getRowModel().rows
  const virtualItems = rowVirtualizer.getVirtualItems()
  // Virtual spacers: preserve the full scroll height without mounting offscreen patient rows.
  const margin = isMobile ? 0 : 42
  const topSpace = Math.max(0, (virtualItems[0]?.start ?? margin) - margin)
  const bottomSpace = Math.max(
    0,
    rowVirtualizer.getTotalSize() - ((virtualItems.at(-1)?.end ?? margin) - margin),
  )

  // Keyboard navigation: virtual rows must be scrolled into view before they can receive focus.
  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !['ArrowDown', 'ArrowUp'].includes(event.key)
    )
      return
    event.preventDefault()
    const target = Math.max(
      0,
      Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
    )
    const tab =
      (event.target as HTMLElement).closest<HTMLElement>('[data-open-tab]')?.dataset.openTab ??
      'overview'
    rowVirtualizer.scrollToIndex(target, { align: 'auto' })
    requestAnimationFrame(() => requestAnimationFrame(() => focusRow(target, tab)))
  }

  // Responsive rendering: mobile cards and desktop table rows share the same virtual window.
  return (
    <div
      className="ac-list-scroll"
      ref={scrollRef}
      onScroll={(event) =>
        updateListView(context.view, context.actorId, { scrollTop: event.currentTarget.scrollTop })
      }
      aria-busy={busy}
    >
      {isMobile ? (
        <ul className="ac-patient-cards" aria-label="Patients">
          {topSpace > 0 && (
            <li role="presentation" aria-hidden="true" style={{ height: topSpace }} />
          )}
          {virtualItems.map((virtual) => {
            const patient = rows[virtual.index]?.original
            if (!patient) return null
            return (
              <li
                key={patient.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtual.index}
                data-patient-id={patient.id}
                className={`ac-patient-card ac-clickable-patient${saved.lastPatientId === patient.id ? ' ac-last-visited' : ''}`}
                onClick={openPatientRow}
                onKeyDown={(event) => onRowKeyDown(event, virtual.index)}
              >
                <div className="ac-card-heading">
                  <PatientIdentity patient={patient} index={virtual.index} context={linkContext} />
                  <StatusPill status={patient.status} />
                </div>
                {/* Compact card: facts and the two activity shortcuts share one row. */}
                <div className="ac-card-foot">
                  <div className="ac-card-meta">
                    <span>
                      <b>{patient.age}</b> years old
                    </span>
                    <span>
                      Last visit:{' '}
                      <b>{patient.last_visit ? formatDate(patient.last_visit) : 'None recorded'}</b>
                    </span>
                  </div>
                  <div className="ac-card-actions">
                    <PatientActivity
                      patient={patient}
                      index={virtual.index}
                      context={linkContext}
                      kind="notes"
                    />
                    <PatientActivity
                      patient={patient}
                      index={virtual.index}
                      context={linkContext}
                      kind="discussion"
                    />
                  </div>
                </div>
              </li>
            )
          })}
          {bottomSpace > 0 && (
            <li role="presentation" aria-hidden="true" style={{ height: bottomSpace }} />
          )}
        </ul>
      ) : (
        <Table className="ac-patient-table" aria-rowcount={total + 1}>
          <caption className="sr-only">
            Patients. Use the up and down arrow keys on patient links to move between rows.
          </caption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      className={`ac-col-${header.column.id}`}
                      aria-sort={
                        sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="ac-sort-button"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sort by ${String(header.column.columnDef.header)}${sorted ? `, currently ${sorted === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown aria-hidden="true" />
                          ) : (
                            <ArrowUpDown aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {topSpace > 0 && (
              <TableRow aria-hidden="true" className="ac-virtual-spacer">
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  style={{ height: topSpace }}
                />
              </TableRow>
            )}
            {virtualItems.map((virtual) => {
              const row = rows[virtual.index]
              if (!row) return null
              return (
                <TableRow
                  key={row.id}
                  data-patient-id={row.id}
                  aria-rowindex={
                    (context.search.page - 1) * context.search.page_size + virtual.index + 2
                  }
                  className={`ac-clickable-patient${saved.lastPatientId === row.id ? ' ac-last-visited' : ''}`}
                  onClick={openPatientRow}
                  onKeyDown={(event) => onRowKeyDown(event, virtual.index)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={`ac-col-${cell.column.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
            {bottomSpace > 0 && (
              <TableRow aria-hidden="true" className="ac-virtual-spacer">
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  style={{ height: bottomSpace }}
                />
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

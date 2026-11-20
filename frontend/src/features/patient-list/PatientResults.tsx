import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PatientListItem } from '@/api/types'
import { getListView, restoredRowIndex, updateListView } from '@/app/view-state'
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
import { searchForSorting, tableSorting, type ListSearch } from './search-params'

interface PatientResultsProps {
  items: PatientListItem[]
  total: number
  busy: boolean
  context: PatientLinkContext
  onChange: (patch: Partial<ListSearch>) => void
  onFocusHeading: () => void
}

export default function PatientResults({
  items,
  total,
  busy,
  context,
  onChange,
  onFocusHeading,
}: PatientResultsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const showConditions = useMediaQuery('(min-width: 1280px)')
  const saved = useRef(getListView(context.view, context.actorId))
  const restored = useRef(false)
  const signature = JSON.stringify(context.search)
  const previousSignature = useRef(signature)
  // Memoization: reuse column definitions until the patient-link context changes.
  const columns = useMemo<ColumnDef<PatientListItem>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Patient',
        cell: ({ row }) => (
          <PatientIdentity patient={row.original} index={row.index} context={context} />
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
            context={context}
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
            context={context}
            kind="discussion"
          />
        ),
      },
    ],
    [context],
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
  // Virtualization: render visible rows plus a small buffer within the fetched page.
  // Stable patient keys keep row identity intact when results change.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (isMobile ? 216 : 64),
    getItemKey: (index) => items[index]?.id ?? index,
    overscan: 4,
    useFlushSync: false,
    scrollMargin: isMobile ? 0 : 42,
    scrollPaddingStart: isMobile ? 0 : 42,
    initialOffset: saved.current.scrollTop,
    initialRect: { width: 1000, height: 500 },
  })
  const virtualItems = rowVirtualizer.getVirtualItems()
  // Virtual spacers: preserve the full scroll height without mounting offscreen patient rows.
  const margin = isMobile ? 0 : 42
  const topSpace = Math.max(0, (virtualItems[0]?.start ?? margin) - margin)
  const bottomSpace = Math.max(
    0,
    rowVirtualizer.getTotalSize() - ((virtualItems.at(-1)?.end ?? margin) - margin),
  )

  // Focus target: return to the same patient action, such as Notes or Discussion, when possible.
  const focusRow = (index: number, tab = 'overview') => {
    const id = items[index]?.id
    const row = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>('[data-patient-id]') ?? [],
    ).find((element) => element.dataset.patientId === id)
    const target =
      row?.querySelector<HTMLElement>(`a[data-open-tab="${tab}"]`) ??
      row?.querySelector<HTMLElement>('a')
    if (target) target.focus({ preventScroll: true })
    return Boolean(target)
  }

  // Search-view reset: a different filter, sort or page starts at the top of its results.
  useEffect(() => {
    if (previousSignature.current !== signature) {
      previousSignature.current = signature
      rowVirtualizer.scrollToOffset(0)
      updateListView(context.view, context.actorId, { scrollTop: 0 })
    }
  }, [signature, context.view, context.actorId, rowVirtualizer])

  // Scroll and focus restoration: scroll the saved row into the virtual window before focusing it.
  // Wait for its DOM to mount; fall back to the heading if the patient is no longer in the results.
  useLayoutEffect(() => {
    if (busy || restored.current) return
    const snapshot = saved.current
    rowVirtualizer.scrollToOffset(snapshot.scrollTop)
    if (!snapshot.restoreFocus) {
      restored.current = true
      return
    }
    const index = restoredRowIndex(
      items.map((patient) => patient.id),
      snapshot,
    )
    if (index !== null) rowVirtualizer.scrollToIndex(index, { align: 'auto' })
    let secondFrame = 0
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (index === null || !focusRow(index, snapshot.triggerTab)) onFocusHeading()
        restored.current = true
        updateListView(context.view, context.actorId, { restoreFocus: false })
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
    }
  })

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
                className={`ac-patient-card${saved.current.lastPatientId === patient.id ? ' ac-last-visited' : ''}`}
                onKeyDown={(event) => onRowKeyDown(event, virtual.index)}
              >
                <div className="ac-card-heading">
                  <PatientIdentity patient={patient} index={virtual.index} context={context} />
                  <StatusPill status={patient.status} />
                </div>
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
                    context={context}
                    kind="notes"
                  />
                  <PatientActivity
                    patient={patient}
                    index={virtual.index}
                    context={context}
                    kind="discussion"
                  />
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
                  className={saved.current.lastPatientId === row.id ? 'ac-last-visited' : undefined}
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

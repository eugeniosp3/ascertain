import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { Bell, CheckCheck, LoaderCircle, Plus, SearchX, Users } from 'lucide-react'
import { useActor } from '@/app/actor-context'
import { ActorRequired } from '@/app/ActorSelector'
import { BackToPatients } from '@/app/AppShell'
import { getListView, updateListView } from '@/app/view-state'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/utils/count'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotificationSummary } from '@/features/notifications/queries'
import { usePatientList } from './queries'
import { clampPage, validateListSearch, type ListSearch, type ListView } from './search-params'
import PatientFilters from './PatientFilters'
import PatientPagination from './PatientPagination'
import PatientResults from './PatientResults'

export default function PatientListScreen({ view }: { view: ListView }) {
  const { actorId } = useActor()
  const navigate = useNavigate()
  const rawSearch = useSearch({ strict: false })
  // URL state: validated search parameters drive both the API query and the visible controls.
  const search = useMemo(() => validateListSearch(rawSearch), [rawSearch])
  const navigationKey = useLocation({
    select: (location) => location.state.__TSR_key ?? location.href,
  })
  const query = usePatientList(search, view, actorId)
  const summary = useNotificationSummary(actorId)
  const heading = useRef<HTMLHeadingElement>(null)
  const notifications = view === 'notifications'
  const data = query.data
  const needsClamp = Boolean(
    data && !query.isPlaceholderData && search.page > clampPage(data.total, search.page_size),
  )
  // Empty-state meaning: a globally caught-up inbox differs from filters matching no patients.
  const caughtUp = notifications && summary.data?.unread_comments_count === 0
  const filtered = Boolean(search.q || search.status !== 'all')

  // View navigation: keep Patients and Notifications on their own URL and saved return state.
  const changeSearch = (patch: Partial<ListSearch>, replace = false) => {
    const next = validateListSearch({ ...search, ...patch })
    updateListView(view, actorId, { search: next, scrollTop: 0, restoreFocus: false })
    void navigate({ to: notifications ? '/notifications' : '/patients', search: next, replace })
  }
  // Return-state memory: closing detail can restore this viewer's last list query.
  useEffect(() => {
    updateListView(view, actorId, { search })
  }, [view, actorId, search])
  // Pagination repair: after deletion or read acknowledgement, move an empty final page back in range.
  useEffect(() => {
    if (!needsClamp || !data) return
    // Keep the pending return focus while the nearest valid page loads.
    const next = { ...search, page: clampPage(data.total, search.page_size) }
    updateListView(view, actorId, { search: next })
    void navigate({
      to: notifications ? '/notifications' : '/patients',
      search: next,
      replace: true,
    })
  }, [needsClamp, data, search, navigate, view, actorId, notifications])
  // Accessible fallback: if no row remains after returning from detail, focus the list heading.
  useEffect(() => {
    if (
      !query.isFetching &&
      !needsClamp &&
      data?.items.length === 0 &&
      getListView(view, actorId).restoreFocus
    ) {
      heading.current?.focus()
      updateListView(view, actorId, { restoreFocus: false })
    }
  }, [query.isFetching, needsClamp, data?.items.length, view, actorId])

  if (!actorId) return <ActorRequired />
  // Result states: render loading, failure with retry, populated results or a meaningful empty view.
  return (
    <section className="ac-patient-list" aria-labelledby="patient-list-title">
      <div className="ac-page-heading">
        <div>
          <h1 id="patient-list-title" ref={heading} tabIndex={-1}>
            {notifications ? 'Notifications' : 'Patients'}
          </h1>
          {/* Patients needs no subtitle: the results status below already states the count. */}
          {notifications && (
            <p>
              {summary.data
                ? `${formatCount(summary.data.unread_comments_count, 'unread comment')} across ${formatCount(summary.data.patients_with_unread_comments, 'patient')}`
                : 'Unread conversations for your selected demo user'}
            </p>
          )}
        </div>
        {notifications ? (
          <BackToPatients />
        ) : (
          <Button asChild>
            <Link
              to="/patients/new"
              search={{ ...search, tab: 'overview', returnTo: 'patients' }}
              state={{ workspaceOrigin: 'patients' }}
            >
              <Plus aria-hidden="true" />
              Add patient
            </Link>
          </Button>
        )}
      </div>
      {notifications && (
        <div className="ac-notification-notice">
          <Bell aria-hidden="true" />
          <p>
            <strong>Unread conversations</strong> · Only opening Discussion marks comments read.
          </p>
        </div>
      )}
      <PatientFilters search={search} navigationKey={navigationKey} onChange={changeSearch} />
      <div className="ac-results-status" role="status" aria-live="polite" aria-atomic="true">
        {query.isFetching ? (
          <>
            <LoaderCircle className="ac-loading-spinner" aria-hidden="true" />
            {query.isPending ? 'Loading patients…' : 'Updating patients…'}
          </>
        ) : query.isError ? (
          'Patient list unavailable'
        ) : data ? (
          `${data.total} ${data.total === 1 ? 'patient' : 'patients'}${filtered ? ' matching your filters' : ''}`
        ) : (
          ''
        )}
      </div>
      <div className="ac-table-surface ac-surface">
        {query.isError ? (
          <div className="ac-empty" role="alert">
            <h2>Patients couldn’t be loaded</h2>
            <p>{query.error.message || 'The service is unavailable. Try again.'}</p>
            <Button
              variant="outline"
              onClick={() => {
                void query.refetch()
              }}
            >
              Retry
            </Button>
          </div>
        ) : query.isPending ? (
          <div className="ac-list-skeleton" aria-label="Loading patients">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index}>
                <Skeleton className="ac-skeleton-avatar" />
                <Skeleton className="ac-skeleton-name" />
                <Skeleton className="ac-skeleton-cell" />
                <Skeleton className="ac-skeleton-cell" />
              </div>
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <PatientResults
            key={`${view}:${actorId ?? 'none'}`}
            items={data.items}
            total={data.total}
            busy={query.isFetching || needsClamp}
            context={{ actorId, view, search }}
            onChange={changeSearch}
            onFocusHeading={() => heading.current?.focus()}
          />
        ) : (
          <div className="ac-empty">
            {caughtUp ? (
              <CheckCheck aria-hidden="true" />
            ) : filtered ? (
              <SearchX aria-hidden="true" />
            ) : (
              <Users aria-hidden="true" />
            )}
            <h2>
              {caughtUp
                ? 'You’re all caught up'
                : filtered
                  ? 'No matching patients'
                  : notifications
                    ? 'No unread conversations'
                    : 'No patients yet'}
            </h2>
            <p>
              {caughtUp
                ? 'There are no unread comments for this demo user.'
                : filtered
                  ? 'Try another search or clear the status filter.'
                  : notifications
                    ? 'New comments from your team will appear here.'
                    : 'Add your first patient to start their record.'}
            </p>
            {filtered && !caughtUp && (
              <Button
                variant="outline"
                onClick={() => changeSearch({ q: '', status: 'all', page: 1 })}
              >
                Clear filters
              </Button>
            )}
            {!filtered && !notifications && (
              <Button asChild>
                <Link
                  to="/patients/new"
                  search={{ ...search, tab: 'overview', returnTo: 'patients' }}
                >
                  Add patient
                </Link>
              </Button>
            )}
          </div>
        )}
        {data && !query.isError && (
          <PatientPagination
            search={search}
            total={data.total}
            busy={query.isPlaceholderData || needsClamp}
            onChange={changeSearch}
          />
        )}
      </div>
      {notifications && summary.isError && (
        <p className="ac-summary-error" role="status">
          Unread totals couldn’t be refreshed.{' '}
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              void summary.refetch()
            }}
          >
            Retry totals
          </Button>
        </p>
      )}
    </section>
  )
}

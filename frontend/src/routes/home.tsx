import { Link } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { ArrowRight, Bell, Plus, Users } from 'lucide-react'
import { api } from '@/api'
import type { PatientListParams } from '@/api/types'
import { useActor } from '@/app/actor-context'
import { ActorRequired } from '@/app/ActorSelector'
import { patientKeys } from '@/app/query-keys'
import { resetListView, useSavedListSearch } from '@/app/view-state'
import { Button } from '@/components/ui/button'
import { useNotificationSummary } from '@/features/notifications/queries'
import { PatientAvatar } from '@/features/patient-list/PatientIdentity'
import { defaultListSearch } from '@/features/patient-list/search-params'
import { formatDate } from '@/utils/dates'
import { getPatientName } from '@/utils/patient'

const overviewParams: PatientListParams[] = [
  { page: 1, page_size: 5, sort_by: 'last_visit', order: 'desc' },
  { page: 1, page_size: 1, status: 'active' },
  { page: 1, page_size: 1, status: 'inactive' },
]

export default function HomePage() {
  const { actorId } = useActor()
  const queries = useQueries({
    queries: overviewParams.map((params) => ({
      queryKey: patientKeys.list(actorId, params),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.listPatients(params, { actorId: actorId ?? undefined, signal }),
      enabled: actorId !== null,
    })),
  })
  const [recent, active, inactive] = queries
  const notifications = useNotificationSummary(actorId)
  const saved = useSavedListSearch('patients', actorId)
  if (!actorId) return <ActorRequired />
  const stats = [
    ['Total patients', recent?.data?.total],
    ['Active', active?.data?.total],
    ['Inactive', inactive?.data?.total],
    ['Unread comments', notifications.data?.unread_comments_count],
  ] as const
  return (
    <section className="ac-overview" aria-labelledby="overview-title">
      <div className="ac-page-heading">
        <div>
          <h1 id="overview-title">Overview</h1>
          <p>A clear view of your patient workspace.</p>
        </div>
        <Button asChild>
          <Link to="/patients/new" search={{ ...saved, tab: 'overview', returnTo: 'patients' }}>
            <Plus aria-hidden="true" />
            Add patient
          </Link>
        </Button>
      </div>
      <dl className="ac-stats">
        {stats.map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {queries.some((query) => query.isError) && (
        <div className="ac-notification-notice" role="alert">
          <p>Some patient totals couldn’t be loaded.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              for (const query of queries) if (query.isError) void query.refetch()
            }}
          >
            Retry
          </Button>
        </div>
      )}
      <div className="ac-overview-columns">
        <section className="ac-surface ac-recent-visits">
          <div className="ac-card-header">
            <h2>Recent visits</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/patients" search={saved}>
                All patients
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {recent?.isPending ? (
            <p className="ac-overview-note" role="status">
              Loading recent visits…
            </p>
          ) : recent?.isError ? (
            <p className="ac-overview-note">Recent visits are unavailable.</p>
          ) : recent?.data?.items.some((patient) => patient.last_visit) ? (
            <ul>
              {recent.data.items
                .filter((patient) => patient.last_visit)
                .map((patient) => (
                  <li key={patient.id}>
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: patient.id }}
                      search={{ ...saved, tab: 'overview', returnTo: 'patients' }}
                      className="ac-recent-link"
                    >
                      <PatientAvatar name={getPatientName(patient)} />
                      <span>{getPatientName(patient)}</span>
                    </Link>
                    <time>{formatDate(patient.last_visit)}</time>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="ac-overview-note">No patient visits recorded yet.</p>
          )}
        </section>
        <section className="ac-surface ac-shortcuts">
          <div className="ac-card-header">
            <h2>Workspace</h2>
          </div>
          <Link to="/patients" search={saved}>
            <Users aria-hidden="true" />
            <span>
              <strong>Patient directory</strong>
              <small>Find records, notes, and clinical summaries</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            to="/notifications"
            search={defaultListSearch}
            onClick={() => resetListView('notifications', actorId)}
          >
            <Bell aria-hidden="true" />
            <span>
              <strong>Unread conversations</strong>
              <small>See new comments from your team</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      </div>
    </section>
  )
}

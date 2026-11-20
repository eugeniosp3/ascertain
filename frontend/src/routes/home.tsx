import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { ArrowRight, Bell, Plus, Users } from 'lucide-react'
import { useActor } from '@/app/actor-context'
import { ActorRequired } from '@/app/ActorSelector'
import { resetListView, useSavedListSearch } from '@/app/view-state'
import { Button } from '@/components/ui/button'
import { CountPill } from '@/components/ui/count-pill'
import { useNotificationSummary } from '@/features/notifications/queries'
import { aggregateOverview, recentVisits } from '@/features/overview/aggregation'
import { overviewCopy } from '@/features/overview/copy'
import { OverviewCharts } from '@/features/overview/OverviewCharts'
import { useOverviewProjection } from '@/features/overview/queries'
import { PatientAvatar } from '@/features/patient-list/PatientIdentity'
import { defaultListSearch } from '@/features/patient-list/search-params'
import { formatDate } from '@/utils/dates'
import { getPatientName } from '@/utils/patient'

export default function HomePage() {
  const { actorId, users } = useActor()
  const projection = useOverviewProjection(actorId)
  const summary = useMemo(
    () => projection.data && aggregateOverview(projection.data.patients, projection.data.asOfDate),
    [projection.data],
  )
  const recent = useMemo(
    () => (projection.data ? recentVisits(projection.data.patients, projection.data.asOfDate) : []),
    [projection.data],
  )
  const notifications = useNotificationSummary(actorId)
  const saved = useSavedListSearch('patients', actorId)
  if (!actorId) return <ActorRequired />
  const unread = notifications.data?.unread_comments_count
  const actor = users.find((user) => user.id === actorId)
  // Charts and recent visits share one projection: the selected user's assigned cohort. While it
  // loads, the wording names the cohort being requested; once loaded, the cohort it declares.
  const copy = overviewCopy(projection.data?.scope ?? 'assigned', actor?.display_name)
  // One summary line of counts not already charted below (status lives in the Status card).
  // Unread comments stay per viewer across all patients, whatever the chart cohort is.
  const summaryLine = [
    summary && copy.patients(summary.total),
    unread !== undefined && copy.unread(unread),
  ].filter(Boolean)
  return (
    <section className="ac-overview" aria-labelledby="overview-title">
      <div className="ac-page-heading">
        <div>
          <h1 id="overview-title">Overview</h1>
          <p className="ac-overview-summary">
            {summaryLine.length > 0 ? summaryLine.join(' · ') : 'Your patient workspace'}
          </p>
        </div>
        <Button asChild>
          <Link to="/patients/new" search={{ ...saved, tab: 'overview', returnTo: 'patients' }}>
            <Plus aria-hidden="true" />
            Add patient
          </Link>
        </Button>
      </div>
      <OverviewCharts
        copy={copy}
        summary={summary}
        isFetching={projection.isFetching}
        isError={projection.isError}
        updatedAt={projection.dataUpdatedAt}
        onRetry={() => void projection.refetch()}
      />
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
          {projection.isPending ? (
            <p className="ac-overview-note" role="status">
              Loading recent visits…
            </p>
          ) : projection.isError && !projection.data ? (
            <p className="ac-overview-note">Recent visits are unavailable.</p>
          ) : recent.length > 0 ? (
            <ul>
              {recent.map((patient) => (
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
                  <time dateTime={patient.last_visit!}>{formatDate(patient.last_visit)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ac-overview-note">No recorded visits among your assigned patients.</p>
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
              <small>Every patient: records, notes and summaries</small>
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
              {/* The unread count belongs to the title, not floating mid-card. */}
              <strong>
                Unread conversations
                {unread !== undefined && unread > 0 && (
                  <CountPill count={unread} variant="unread" singularLabel="unread comment" />
                )}
              </strong>
              <small>New comments for you, across all patients</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      </div>
    </section>
  )
}

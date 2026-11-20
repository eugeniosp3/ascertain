import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { InlineError } from '@/components/shared/InlineError'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/utils/dates'
import { getFormErrors } from '@/utils/form-errors'

export function SummaryPanel({ patientId, actorId }: { patientId: string; actorId: string }) {
  // Summary query: display the adapter's clinical summary; note mutations invalidate this cache key.
  const summary = useQuery({
    queryKey: patientKeys.summary(patientId),
    queryFn: ({ signal }) => api.getSummary(patientId, { actorId, signal }),
  })
  return (
    <section className="pw-panel" aria-label="Patient summary">
      <div>
        <h3 className="text-lg font-semibold">Patient summary</h3>
        <p className="text-sm text-muted-foreground">
          Profile and clinical notes. Team discussion is kept separate.
        </p>
      </div>
      {summary.isPending && (
        <div role="status" aria-label="Loading summary" className="grid gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {summary.isError && (
        <InlineError
          message={getFormErrors(summary.error).message}
          retry={() => {
            void summary.refetch()
          }}
        />
      )}
      {summary.data && (
        <>
          <p className="text-sm text-muted-foreground">
            Template summary · Generated{' '}
            <time dateTime={summary.data.generated_at}>
              {formatDateTime(summary.data.generated_at)}
            </time>
          </p>
          <p className="pw-prose">{summary.data.summary}</p>
        </>
      )}
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { api } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { InlineError } from '@/components/shared/InlineError'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime } from '@/utils/dates'
import { getFormErrors } from '@/utils/form-errors'

export const AI_SUMMARY_HINT =
  "AI-generated summary. It refreshes automatically when this patient's data changes."

// AI provenance: the icon is a real button, so keyboard users can open the same explanation.
// The heading text says "AI summary", so the icon never carries the meaning alone. A local
// provider keeps the panel self-contained (Radix allows nested providers).
function AiSummaryHint() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="About AI summaries"
            className="text-lilac-ink"
          >
            <Sparkles aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{AI_SUMMARY_HINT}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SummaryPanel({ patientId, actorId }: { patientId: string; actorId: string }) {
  // Summary query: the backend stores each summary and regenerates it only when the profile or
  // notes change. Note and profile mutations already invalidate this key, so no extra cache rule.
  const summary = useQuery({
    queryKey: patientKeys.summary(patientId),
    queryFn: ({ signal }) => api.getSummary(patientId, { actorId, signal }),
  })
  const ai = summary.data?.method === 'llm'
  return (
    <section className="pw-panel" aria-label="Patient summary">
      <div>
        <div className="flex items-center gap-1">
          {ai && <AiSummaryHint />}
          <h3 className="text-lg font-semibold">{ai ? 'AI summary' : 'Summary'}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Profile and clinical notes. Team discussion is kept separate.
        </p>
      </div>
      {summary.isPending && (
        <div role="status" aria-label="Loading summary" className="grid gap-3">
          {/* An LLM summary can take a few seconds, so say what is happening, not only skeletons. */}
          <p className="text-sm text-muted-foreground">
            Generating the summary. This can take a few seconds.
          </p>
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
            Updated{' '}
            <time dateTime={summary.data.generated_at}>
              {formatDateTime(summary.data.generated_at)}
            </time>
          </p>
          {!ai && (
            <p className="text-sm text-muted-foreground">
              AI summary unavailable — showing the standard summary.
            </p>
          )}
          <p className="pw-prose">{summary.data.summary}</p>
        </>
      )}
    </section>
  )
}

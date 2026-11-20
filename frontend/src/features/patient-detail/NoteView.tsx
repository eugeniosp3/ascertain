import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { api, isApiError } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineError } from '@/components/shared/InlineError'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDateTime } from '@/utils/dates'
import { getFormErrors } from '@/utils/form-errors'
import { ConfirmDelete } from './ConfirmDelete'
import { invalidateNotes } from './queries'
import { noteLabel } from './schema'

function httpsLink(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function NoteView({
  patientId,
  actorId,
  noteId,
  onBack,
}: {
  patientId: string
  actorId: string
  noteId: string
  onBack: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const client = useQueryClient()
  const note = useQuery({
    queryKey: patientKeys.note(patientId, noteId),
    queryFn: ({ signal }) => api.getNote(patientId, noteId, { actorId, signal }),
    retry: false,
  })
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [note.data, note.error])
  const deletion = useMutation({
    mutationFn: () => api.deleteNote(patientId, noteId, { actorId }),
    onSuccess: () => {
      client.removeQueries({ queryKey: patientKeys.note(patientId, noteId), exact: true })
      void invalidateNotes(client, patientId)
      onBack()
    },
  })
  const gone = isApiError(note.error) && note.error.status === 410
  // A malformed note ID is rejected with 422 before lookup; treat it as not found, without retry.
  const missing = isApiError(note.error) && [404, 422].includes(note.error.status)
  return (
    <article className="pw-panel">
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to Notes
        </Button>
      </div>
      {note.isPending && (
        <div role="status" aria-label="Loading note">
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {(gone || missing) && (
        <>
          <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold">
            {gone ? 'This note was deleted' : 'Note not found'}
          </h3>
          <EmptyState
            title={
              gone
                ? 'The note is no longer available.'
                : 'This note is unavailable for this patient.'
            }
            description="Return to Notes to view the active clinical notes."
          />
        </>
      )}
      {note.isError && !gone && !missing && (
        <InlineError
          message={getFormErrors(note.error).message}
          retry={() => {
            void note.refetch()
          }}
        />
      )}
      {note.data && !note.isError && (
        <>
          <div>
            <h3 ref={heading} tabIndex={-1} className="text-xl font-semibold">
              {noteLabel(note.data.content)}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {note.data.author.display_name} · Clinical time{' '}
              <time dateTime={note.data.timestamp}>{formatDateTime(note.data.timestamp)}</time>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatDateTime(note.data.created_at)}
              {note.data.updated_at !== note.data.created_at &&
                ` · Updated ${formatDateTime(note.data.updated_at)}`}
            </p>
          </div>
          <p className="pw-prose">{note.data.content}</p>
          {note.data.attachments.length > 0 && (
            <section className="pw-section">
              <h4 className="mb-2 font-semibold">Files</h4>
              <ul className="grid gap-3">
                {note.data.attachments.map((file) => (
                  <li key={file.id}>
                    {httpsLink(file.source_url) ? (
                      <a
                        className="inline-flex min-h-11 items-center gap-2 underline"
                        href={file.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {file.display_name}
                        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <span>{file.display_name} · File link unavailable</span>
                    )}
                    {file.source_description && (
                      <p className="text-sm text-muted-foreground">{file.source_description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  setCopyMessage('Note link copied.')
                } catch {
                  setCopyMessage(
                    'Could not copy the link. You can copy the address from your browser.',
                  )
                }
              }}
            >
              <Copy aria-hidden="true" />
              Copy note link
            </Button>
            {note.data.author.id === actorId && (
              <ConfirmDelete
                label="Delete note"
                description="This clinical note will be removed. Existing discussion links will show that the note was deleted."
                pending={deletion.isPending}
                error={deletion.error}
                onConfirm={() => deletion.mutateAsync()}
              />
            )}
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {copyMessage}
          </p>
        </>
      )}
    </article>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { InlineError } from '@/components/shared/InlineError'
import { getFormErrors } from '@/utils/form-errors'
import { CommentForm } from './CommentForm'
import { CommentItem } from './CommentItem'
import { useDiscussionRead } from './useDiscussionRead'

interface Props {
  patientId: string
  actorId: string
  active: boolean
  onNoteOpen: (id: string) => void
}
const noComments: never[] = []

export function DiscussionPanel(props: Props) {
  // Discussion identity: each patient/viewer visit owns its read attempts and discussion draft.
  return <DiscussionVisit key={`${props.patientId}:${props.actorId}`} {...props} />
}

function DiscussionVisit({ patientId, actorId, active, onNoteOpen }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const params = { page, page_size: pageSize }
  // Discussion query: the viewer and page are part of cache identity, and inactive panels do not fetch.
  const comments = useQuery({
    queryKey: patientKeys.comments(patientId, actorId, params),
    queryFn: ({ signal }) => api.listComments(patientId, params, { actorId, signal }),
    enabled: active,
  })
  const users = useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => api.listUsers({ actorId, signal }),
    enabled: active,
  })
  // Read acknowledgement: wait for a settled displayed page before asking the hook to mark comments read.
  const { newIds, readError, reading, retryRead } = useDiscussionRead(
    patientId,
    actorId,
    active && comments.isSuccess && !comments.isFetching,
    comments.data?.items ?? noComments,
  )
  const totalPages = Math.max(1, Math.ceil((comments.data?.total ?? 0) / pageSize))
  const shownPage = Math.min(page, totalPages)
  // A deletion can remove the last page. Render the preceding page immediately.
  if (comments.isSuccess && page > totalPages) setPage(totalPages)
  return (
    <section className="pw-panel" aria-label="Team discussion">
      <div>
        <h3 className="text-lg font-semibold">Team discussion</h3>
        <p className="text-sm text-muted-foreground">
          Comments between the care team. Discussion is separate from clinical notes and is never
          used in the summary.
        </p>
      </div>
      {readError != null && (
        <InlineError
          message={`Comments could not be marked as read. ${getFormErrors(readError).message}`}
          retry={retryRead}
        />
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {reading
          ? 'Marking displayed comments as read…'
          : newIds.size > 0 && !readError
            ? 'Comments that were unread during this visit keep their New label.'
            : ''}
      </p>
      {comments.isPending && (
        <div role="status" aria-label="Loading discussion" className="grid gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {comments.isError && (
        <InlineError
          message={getFormErrors(comments.error).message}
          retry={() => {
            void comments.refetch()
          }}
        />
      )}
      {comments.isSuccess && comments.data.total === 0 && (
        <EmptyState title="No comments yet" description="Start the care team discussion below." />
      )}
      {comments.data && (
        <>
          <ol className="pw-section grid gap-0" aria-label="Comments">
            {comments.data.items.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                patientId={patientId}
                actorId={actorId}
                isNew={comment.is_unread || newIds.has(comment.id)}
                onNoteOpen={onNoteOpen}
              />
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Comments per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-20" aria-label="Comments per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {shownPage} of {totalPages} · {comments.data.total} comments
              </span>
              <Button
                variant="outline"
                disabled={page <= 1 || comments.isFetching}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= totalPages || comments.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <CommentForm
        patientId={patientId}
        actorId={actorId}
        active={active}
        authorName={users.data?.find((user) => user.id === actorId)?.display_name}
      />
    </section>
  )
}

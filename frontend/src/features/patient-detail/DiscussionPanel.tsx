import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api, type Comment, type CommentPageParams } from '@/api'
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
/** The smallest page-size option; at or below it with no cursors there is nothing to page. */
const minPageSize = 10

export function DiscussionPanel(props: Props) {
  // Discussion identity: each patient/viewer visit owns its read attempts and discussion draft.
  return <DiscussionVisit key={`${props.patientId}:${props.actorId}`} {...props} />
}

function DiscussionVisit({ patientId, actorId, active, onNoteOpen }: Props) {
  const visit = useId()
  const [pageSize, setPageSize] = useState(10)
  const [position, setPosition] = useState<{
    cursor: string | null
    previous: (string | null)[]
    snapshot: number
  }>({ cursor: null, previous: [], snapshot: 0 })
  const [posted, setPosted] = useState<Comment | null>(null)
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set())
  const editing = editingIds.size > 0
  const params: CommentPageParams =
    position.cursor === null
      ? { page: 1, page_size: pageSize }
      : { cursor: position.cursor, page_size: pageSize }
  const page: {
    key: { visit: string; snapshot: number; page_size: number; cursor: string | null }
    params: CommentPageParams
  } = {
    key: { visit, snapshot: position.snapshot, page_size: pageSize, cursor: position.cursor },
    params,
  }
  // Discussion query: the viewer and page are part of cache identity, and inactive panels do not fetch.
  const comments = useQuery({
    queryKey: patientKeys.comments(patientId, actorId, page.key),
    queryFn: ({ signal }) => api.listComments(patientId, page.params, { actorId, signal }),
    enabled: active,
    // A visit keeps its chronological snapshot until Refresh or a related mutation.
    // Counts still revalidate globally; a read receipt must not restart page one's snapshot.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const users = useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => api.listUsers({ actorId, signal }),
    enabled: active,
  })
  // Read acknowledgement: wait for a settled displayed page before asking the hook to mark comments read.
  const { newIds, pageDisplayed, readError, reading, retryRead } = useDiscussionRead(
    patientId,
    actorId,
    active && comments.isSuccess && !comments.isFetching,
    comments.data?.items ?? noComments,
    comments.data?.read_through,
    JSON.stringify(page.key),
  )
  const refresh = () => {
    setPosition((current) => ({ cursor: null, previous: [], snapshot: current.snapshot + 1 }))
  }
  // Forward cursors are never retained: Next always follows the current response.
  // A refetched first page therefore cannot revive descendants from an older snapshot.
  const nextCursor = comments.data?.next_cursor
  if (posted && comments.data?.items.some((comment) => comment.id === posted.id)) setPosted(null)
  const changeEditing = (id: string, value: boolean) => {
    setEditingIds((previous) => {
      const next = new Set(previous)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }
  // Paging controls appear only when there is something to page through or resize.
  const pageable = Boolean(
    comments.data &&
    (position.previous.length > 0 || nextCursor || comments.data.total > minPageSize),
  )
  // Hierarchy: the conversation and composer lead; Refresh is a quiet header action.
  return (
    <section className="pw-panel pw-discussion" aria-label="Team discussion">
      <div className="pw-panel-head">
        <div>
          <h3 className="text-lg font-semibold">Team discussion</h3>
          <p className="text-sm text-muted-foreground">
            Not part of clinical notes or summaries. Comments are shown oldest first.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="pw-quiet-action"
          disabled={!active || comments.isFetching || editing}
          onClick={refresh}
        >
          <RefreshCw aria-hidden="true" />
          Refresh discussion
        </Button>
      </div>
      {editing && (
        <p className="text-sm text-muted-foreground">
          Finish editing before changing pages or refreshing. Your draft stays here.
        </p>
      )}
      {readError != null && (
        <InlineError
          message={`Comments could not be marked as read. ${getFormErrors(readError).message}`}
          retry={retryRead}
        />
      )}
      <p role="status" className="pw-discussion-status text-sm text-muted-foreground">
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
          {comments.data.items.length === 0 && comments.data.total > 0 && (
            <EmptyState
              title="No comments remain on this page"
              description="Go to the previous page or refresh discussion to start again."
            />
          )}
          {comments.data.items.length > 0 && (
            <ol className="pw-section pw-comments grid gap-0" aria-label="Comments">
              {comments.data.items.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  patientId={patientId}
                  actorId={actorId}
                  isNew={comment.is_unread || newIds.has(comment.id)}
                  onNoteOpen={onNoteOpen}
                  active={active}
                  onEditingChange={(value) => changeEditing(comment.id, value)}
                />
              ))}
            </ol>
          )}
          <div className="pw-comment-pager">
            <span className="text-sm text-muted-foreground">
              Page {position.previous.length + 1} · {comments.data.total}{' '}
              {comments.data.total === 1 ? 'comment' : 'comments'}
            </span>
            {pageable && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Comments per page</span>
                  <Select
                    value={String(pageSize)}
                    disabled={editing || comments.isFetching}
                    onValueChange={(value) => {
                      setPageSize(Number(value))
                      refresh()
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={position.previous.length === 0 || comments.isFetching || editing}
                    onClick={() =>
                      setPosition((current) => ({
                        ...current,
                        cursor: current.previous.at(-1) ?? null,
                        previous: current.previous.slice(0, -1),
                      }))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!nextCursor || comments.isFetching || !pageDisplayed || editing}
                    onClick={() => {
                      if (!nextCursor) return
                      setPosition((current) => ({
                        ...current,
                        cursor: nextCursor,
                        previous: [...current.previous, current.cursor],
                      }))
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {posted && (
        <aside className="pw-section grid gap-2" aria-label="Just posted comment">
          <p role="status" className="text-sm text-muted-foreground">
            Comment posted. Refresh discussion to show it in order.
          </p>
          <p className="pw-prose">{posted.body}</p>
        </aside>
      )}
      <CommentForm
        patientId={patientId}
        actorId={actorId}
        active={active}
        onSaved={setPosted}
        authorName={users.data?.find((user) => user.id === actorId)?.display_name}
      />
    </section>
  )
}

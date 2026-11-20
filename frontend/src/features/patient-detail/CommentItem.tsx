import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api, type Comment } from '@/api'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/utils/dates'
import { getInitials } from '@/utils/patient'
import { CommentForm } from './CommentForm'
import { ConfirmDelete } from './ConfirmDelete'
import { invalidateActivity } from './queries'

/** Demo authors read "Demo User 1 · Sam Rivera"; initials come from the person, not the role. */
function authorInitials(displayName: string) {
  return getInitials(displayName.split(' · ').at(-1) ?? displayName)
}

export function CommentItem({
  comment,
  patientId,
  actorId,
  isNew,
  onNoteOpen,
  active = true,
  onEditingChange,
  onAnnounce,
}: {
  comment: Comment
  patientId: string
  actorId: string
  isNew: boolean
  onNoteOpen: (id: string) => void
  active?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Announces a result whose control leaves the page, such as a deleted comment. */
  onAnnounce?: (message: string) => void
}) {
  const [editing, setEditing] = useState(false)
  // Focus return: closing the inline editor puts focus back on this comment's Edit button.
  const restoreEditFocus = useRef(false)
  const client = useQueryClient()
  const deletion = useMutation({
    mutationFn: () => api.deleteComment(patientId, comment.id, { actorId }),
    onSuccess: () => {
      onAnnounce?.('Comment deleted.')
      void invalidateActivity(client, patientId)
    },
  })
  const closeEditor = () => {
    restoreEditFocus.current = true
    setEditing(false)
    onEditingChange?.(false)
  }
  return (
    <li className="pw-comment">
      <div className="pw-comment-avatar" aria-hidden="true">
        {authorInitials(comment.author.display_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="pw-comment-head">
          <h4 className="font-semibold">{comment.author.display_name}</h4>
          {isNew && (
            <span className="pw-new">
              New<span className="sr-only"> comment during this visit</span>
            </span>
          )}
          <p className="pw-comment-time text-sm text-muted-foreground">
            <time dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
            {comment.updated_at !== comment.created_at && (
              <>
                {' '}
                · Edited{' '}
                <time dateTime={comment.updated_at}>{formatDateTime(comment.updated_at)}</time>
              </>
            )}
          </p>
          {/* Maintenance actions stay small and neutral; red appears only in the confirm dialog. */}
          {comment.author.id === actorId && !editing && (
            <div className="pw-comment-actions">
              <Button
                ref={(node) => {
                  if (node && restoreEditFocus.current) {
                    restoreEditFocus.current = false
                    node.focus()
                  }
                }}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  // A new action clears the last result, so a repeated result is announced again.
                  onAnnounce?.('')
                  setEditing(true)
                  onEditingChange?.(true)
                }}
              >
                Edit <span className="sr-only">comment</span>
              </Button>
              <ConfirmDelete
                label="Delete comment"
                description="This comment and its note references will be removed from the discussion. This action cannot be undone."
                pending={deletion.isPending}
                error={deletion.error}
                onConfirm={() => {
                  onAnnounce?.('')
                  return deletion.mutateAsync()
                }}
              >
                Delete <span className="sr-only">comment</span>
              </ConfirmDelete>
            </div>
          )}
        </div>
        {editing ? (
          <div className="mt-3">
            <CommentForm
              patientId={patientId}
              actorId={actorId}
              comment={comment}
              active={active}
              onSaved={() => {
                onAnnounce?.('Comment saved.')
                closeEditor()
              }}
              onCancel={closeEditor}
            />
          </div>
        ) : (
          <>
            <p className="pw-prose mt-2">{comment.body}</p>
            {comment.note_links.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Linked clinical notes">
                {comment.note_links.map((link) => (
                  <li key={link.id}>
                    {link.is_deleted ? (
                      <span className="pw-note-link pw-deleted">
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        {link.label} · Deleted note
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="pw-note-link"
                        onClick={() => onNoteOpen(link.id)}
                      >
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        {link.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  )
}

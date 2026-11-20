import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api, type Comment } from '@/api'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/utils/dates'
import { getInitials } from '@/utils/patient'
import { CommentForm } from './CommentForm'
import { ConfirmDelete } from './ConfirmDelete'
import { invalidateActivity } from './queries'

export function CommentItem({
  comment,
  patientId,
  actorId,
  isNew,
  onNoteOpen,
}: {
  comment: Comment
  patientId: string
  actorId: string
  isNew: boolean
  onNoteOpen: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const client = useQueryClient()
  const deletion = useMutation({
    mutationFn: () => api.deleteComment(patientId, comment.id, { actorId }),
    onSuccess: () => {
      void invalidateActivity(client, patientId)
    },
  })
  return (
    <li className="pw-comment">
      <div className="pw-comment-avatar" aria-hidden="true">
        {getInitials(comment.author.display_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">{comment.author.display_name}</h4>
          {isNew && (
            <span className="pw-new">
              New<span className="sr-only"> comment during this visit</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <time dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
          {comment.updated_at !== comment.created_at && (
            <>
              {' '}
              · Edited{' '}
              <time dateTime={comment.updated_at}>{formatDateTime(comment.updated_at)}</time>
            </>
          )}
        </p>
        {editing ? (
          <div className="mt-3">
            <CommentForm
              patientId={patientId}
              actorId={actorId}
              comment={comment}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <p className="pw-prose mt-3">{comment.body}</p>
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
            {comment.author.id === actorId && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
                  Edit comment
                </Button>
                <ConfirmDelete
                  label="Delete comment"
                  description="This comment and its note references will be removed from the discussion. This action cannot be undone."
                  pending={deletion.isPending}
                  error={deletion.error}
                  onConfirm={() => deletion.mutateAsync()}
                />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}

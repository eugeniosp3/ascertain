import { useId } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Comment, type CommentWrite } from '@/api'
import { COMMENT_BODY_MAX } from '@/api/constraints'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/shared/FormField'
import { InlineError } from '@/components/shared/InlineError'
import { fieldMessage, getFormErrors } from '@/utils/form-errors'
import { commentSchema } from './schema'
import { invalidateActivity } from './queries'
import { NoteLinkPicker } from './NoteLinkPicker'

interface Props {
  patientId: string
  actorId: string
  authorName?: string
  comment?: Comment
  active?: boolean
  onSaved?: (comment: Comment) => void
  onCancel?: () => void
}

export function CommentForm({
  patientId,
  actorId,
  authorName,
  comment,
  active = true,
  onSaved,
  onCancel,
}: Props) {
  const id = useId()
  const client = useQueryClient()
  const save = useMutation({
    mutationFn: (input: CommentWrite) =>
      comment
        ? api.updateComment(patientId, comment.id, input, { actorId })
        : api.createComment(patientId, input, { actorId }),
    onSuccess: () => {
      void invalidateActivity(client, patientId)
    },
  })
  const form = useForm({
    defaultValues: {
      body: comment?.body ?? '',
      note_ids: comment?.note_links.map((link) => link.id) ?? ([] as string[]),
    },
    validators: { onSubmit: commentSchema },
    onSubmit: async ({ value }) => {
      try {
        const saved = await save.mutateAsync({ body: value.body.trim(), note_ids: value.note_ids })
        if (!comment) form.reset({ body: '', note_ids: [] })
        onSaved?.(saved)
      } catch {
        /* Keep both the text and selected references on failure. */
      }
    },
  })
  const server = save.error ? getFormErrors(save.error) : undefined
  return (
    <form
      className="pw-section grid gap-4"
      aria-label={comment ? 'Edit comment' : 'Add a comment'}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!save.isPending) void form.handleSubmit()
      }}
    >
      <div>
        <h4 className="font-semibold">{comment ? 'Edit comment' : 'Add a comment'}</h4>
        <p className="text-sm text-muted-foreground">
          Posting as {authorName ?? comment?.author.display_name ?? 'the selected user'}
        </p>
      </div>
      {server && <InlineError message={server.message} />}
      {!comment && save.isSuccess && <p role="status">Comment posted.</p>}
      <form.Field name="body">
        {(field) => {
          const error = fieldMessage(field.state.meta.errors) ?? server?.fields.body
          return (
            <FormField label="Comment" htmlFor={`${id}-body`} required error={error}>
              <Textarea
                id={`${id}-body`}
                name="body"
                rows={4}
                maxLength={COMMENT_BODY_MAX}
                value={field.state.value}
                disabled={save.isPending}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  save.reset()
                }}
                onBlur={field.handleBlur}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-body-error` : undefined}
                required
              />
            </FormField>
          )
        }}
      </form.Field>
      <form.Field name="note_ids">
        {(field) => (
          <NoteLinkPicker
            patientId={patientId}
            actorId={actorId}
            selected={field.state.value}
            existingLinks={comment?.note_links}
            disabled={save.isPending}
            active={active}
            onChange={(ids) => {
              field.handleChange(ids)
              save.reset()
            }}
            error={
              fieldMessage(field.state.meta.errors) ??
              Object.entries(server?.fields ?? {}).find(
                ([key]) => key === 'note_ids' || key.startsWith('note_ids['),
              )?.[1]
            }
          />
        )}
      </form.Field>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting || save.isPending}>
              {submitting || save.isPending ? 'Saving…' : comment ? 'Save comment' : 'Post comment'}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

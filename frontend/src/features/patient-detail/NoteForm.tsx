import { useId } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { NOTE_CONTENT_MAX } from '@/api/constraints'
import { patientKeys } from '@/app/query-keys'
import { FormField } from '@/components/shared/FormField'
import { InlineError } from '@/components/shared/InlineError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toDateTimeLocal, toIsoTimestamp } from '@/utils/dates'
import { fieldMessage, getFormErrors } from '@/utils/form-errors'
import { noteSchema } from './schema'
import { invalidateNotes } from './queries'

export function NoteForm({
  patientId,
  actorId,
  onSaved,
  onCancel,
}: {
  patientId: string
  actorId: string
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const id = useId()
  const client = useQueryClient()
  const save = useMutation({
    mutationFn: (input: { timestamp: string; content: string }) =>
      api.createNote(patientId, input, { actorId }),
    onSuccess: (note) => {
      client.setQueryData(patientKeys.note(patientId, note.id), note)
      void invalidateNotes(client, patientId)
    },
  })
  const form = useForm({
    defaultValues: { timestamp: toDateTimeLocal(), content: '' },
    validators: { onSubmit: noteSchema },
    onSubmit: async ({ value }) => {
      try {
        const note = await save.mutateAsync({
          timestamp: toIsoTimestamp(value.timestamp),
          content: value.content.trim(),
        })
        form.reset({ timestamp: toDateTimeLocal(), content: '' })
        onSaved(note.id)
      } catch {
        /* Keep the draft and render the API error below. */
      }
    },
  })
  const server = save.error ? getFormErrors(save.error) : undefined
  return (
    <form
      className="pw-section grid gap-4"
      noValidate
      aria-label="Add clinical note"
      onSubmit={(event) => {
        event.preventDefault()
        if (!save.isPending) void form.handleSubmit()
      }}
    >
      <h4 className="font-semibold">Add clinical note</h4>
      {server && <InlineError message={server.message} />}
      <form.Field name="timestamp">
        {(field) => {
          const error = fieldMessage(field.state.meta.errors) ?? server?.fields.timestamp
          return (
            <FormField
              label="Clinical date and time"
              htmlFor={`${id}-timestamp`}
              required
              error={error}
              description="Use your local time zone; the saved note includes its time zone."
            >
              <Input
                id={`${id}-timestamp`}
                name="timestamp"
                type="datetime-local"
                value={field.state.value}
                disabled={save.isPending}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  save.reset()
                }}
                required
                aria-invalid={!!error}
                aria-describedby={`${id}-timestamp-description${error ? ` ${id}-timestamp-error` : ''}`}
              />
            </FormField>
          )
        }}
      </form.Field>
      <form.Field name="content">
        {(field) => {
          const error = fieldMessage(field.state.meta.errors) ?? server?.fields.content
          return (
            <FormField label="Note" htmlFor={`${id}-content`} required error={error}>
              <Textarea
                id={`${id}-content`}
                name="content"
                rows={7}
                maxLength={NOTE_CONTENT_MAX}
                value={field.state.value}
                disabled={save.isPending}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  save.reset()
                }}
                required
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-content-error` : undefined}
              />
            </FormField>
          )
        }}
      </form.Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={() => {
            // Cancel discards the draft and last error; the next note starts at the current time.
            form.reset({ timestamp: toDateTimeLocal(), content: '' })
            save.reset()
            onCancel()
          }}
        >
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting || save.isPending}>
              {submitting || save.isPending ? 'Saving…' : 'Save note'}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

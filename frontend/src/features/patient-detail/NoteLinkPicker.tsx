import { useId } from 'react'
import type { Comment } from '@/api'
import { MAX_COMMENT_NOTE_IDS } from '@/api/constraints'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/shared/InlineError'
import { getFormErrors } from '@/utils/form-errors'
import { formatDateTime } from '@/utils/dates'
import { usePatientNotes } from './queries'
import { noteLabel } from './schema'

interface Props {
  patientId: string
  actorId: string
  selected: string[]
  onChange: (ids: string[]) => void
  existingLinks?: Comment['note_links']
  disabled?: boolean
  error?: string
  active?: boolean
}

export function NoteLinkPicker({
  patientId,
  actorId,
  selected,
  onChange,
  existingLinks = [],
  disabled,
  error,
  active = true,
}: Props) {
  const id = useId()
  const notes = usePatientNotes(patientId, actorId, active)
  const options = (notes.data ?? [])
    .filter((note) => note.patient_id === patientId)
    .map((note) => ({
      id: note.id,
      label: `${noteLabel(note.content)} · ${formatDateTime(note.timestamp)}`,
      deleted: false,
    }))
  for (const link of existingLinks) {
    if (!options.some((option) => option.id === link.id))
      options.push({ id: link.id, label: link.label, deleted: link.is_deleted })
  }
  const unavailableIds = notes.isSuccess
    ? selected.filter((selectedId) => !options.some((option) => option.id === selectedId))
    : []
  return (
    <fieldset
      className="grid min-w-0 gap-2"
      disabled={disabled}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-2 text-sm font-medium">
        Link clinical notes <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      {notes.isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading available notes…
        </p>
      )}
      {notes.isError && (
        <InlineError
          message={`Notes could not be loaded. ${getFormErrors(notes.error).message}`}
          retry={() => {
            void notes.refetch()
          }}
        />
      )}
      {notes.isSuccess && !options.length && (
        <p className="text-sm text-muted-foreground">This patient has no active notes to link.</p>
      )}
      {unavailableIds.length > 0 && (
        <div className="grid gap-2 rounded-lg border p-3" role="status">
          <p className="text-sm">
            {unavailableIds.length} selected {unavailableIds.length === 1 ? 'note is' : 'notes are'}{' '}
            no longer available.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange(selected.filter((selectedId) => !unavailableIds.includes(selectedId)))
            }
          >
            Remove unavailable references
          </Button>
        </div>
      )}
      {!!options.length && (
        <div className="grid max-h-60 gap-1 overflow-y-auto rounded-lg border p-2">
          {options.map((option, index) => (
            <label
              key={option.id}
              htmlFor={`${id}-${index}`}
              className="flex min-h-11 items-start gap-2 rounded-md p-2 hover:bg-muted"
            >
              <Checkbox
                id={`${id}-${index}`}
                checked={selected.includes(option.id)}
                disabled={
                  disabled ||
                  (!selected.includes(option.id) && selected.length >= MAX_COMMENT_NOTE_IDS)
                }
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...selected, option.id]
                      : selected.filter((value) => value !== option.id),
                  )
                }
              />
              <span className="min-w-0 break-words">
                {option.label}
                {option.deleted && (
                  <span className="text-muted-foreground">
                    {' '}
                    · Deleted note (existing reference)
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}

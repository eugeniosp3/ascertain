import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { InlineError } from '@/components/shared/InlineError'
import { formatDateTime } from '@/utils/dates'
import { getFormErrors } from '@/utils/form-errors'
import { usePatientNotes } from './queries'
import { noteLabel, notePreview } from './schema'
import { NoteForm } from './NoteForm'
import { NoteView } from './NoteView'

interface Props {
  patientId: string
  actorId: string
  active: boolean
  noteId?: string
  onNoteOpen: (id: string) => void
  onBack: () => void
}

export function NotesPanel({ patientId, actorId, active, noteId, onNoteOpen, onBack }: Props) {
  // Clinical notes: fetch this patient's notes only when the panel is active; discussion is a separate query.
  const notes = usePatientNotes(patientId, actorId, active)
  const [composing, setComposing] = useState(false)
  // Save and delete results: the form or note view that triggered them is no longer shown.
  const [announcement, setAnnouncement] = useState('')
  const add = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const shownNote = useRef(noteId)
  // Focus return: leaving a note (Back or Delete) lands on the Notes heading, not the dialog itself.
  useEffect(() => {
    if (shownNote.current && !noteId && active) heading.current?.focus({ preventScroll: true })
    shownNote.current = noteId
  }, [noteId, active])
  // Clinical chronology: sort a copied array by note timestamp without mutating the shared query result.
  const items = [...(notes.data ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  // Draft preservation: hiding the list or composer keeps an unfinished note mounted during navigation.
  return (
    <>
      {/* Outside the hidden list, so results stay audible while a note is open. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {noteId && (
        <NoteView
          key={noteId}
          patientId={patientId}
          actorId={actorId}
          noteId={noteId}
          onBack={onBack}
          onDeleted={() => setAnnouncement('Note deleted.')}
        />
      )}
      <div className="pw-panel" hidden={!!noteId}>
        <div className="pw-panel-head">
          <div>
            <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold">
              Clinical notes
            </h3>
            <p className="text-sm text-muted-foreground">Newest clinical date first.</p>
          </div>
          <Button
            ref={add}
            onClick={() => {
              // A new action clears the last result, so a repeated result is announced again.
              setAnnouncement('')
              setComposing(true)
            }}
            disabled={composing}
          >
            <Plus aria-hidden="true" />
            Add note
          </Button>
        </div>
        <div hidden={!composing}>
          <NoteForm
            patientId={patientId}
            actorId={actorId}
            onCancel={() => {
              // Commit the re-enabled Add note button before focusing it; a disabled button cannot take focus.
              flushSync(() => setComposing(false))
              add.current?.focus()
            }}
            onSaved={(id) => {
              setComposing(false)
              setAnnouncement('Note saved.')
              onNoteOpen(id)
            }}
          />
        </div>
        {notes.isPending && (
          <div role="status" aria-label="Loading notes" className="grid gap-3">
            <span className="sr-only">Loading notes…</span>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {notes.isError && (
          <InlineError
            message={getFormErrors(notes.error).message}
            retry={() => {
              void notes.refetch()
            }}
          />
        )}
        {notes.isSuccess && !items.length && (
          <EmptyState
            title="No clinical notes yet"
            description="Add a note with the clinical date and time to begin."
          />
        )}
        <ul className="grid gap-2">
          {items.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                className="pw-note-card"
                onClick={() => {
                  setAnnouncement('')
                  onNoteOpen(note.id)
                }}
              >
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold">{noteLabel(note.content)}</span>
                  <time className="text-sm text-muted-foreground" dateTime={note.timestamp}>
                    {formatDateTime(note.timestamp)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{note.author.display_name}</p>
                {notePreview(note.content) && (
                  <p className="mt-2 line-clamp-2 whitespace-pre-wrap">
                    {notePreview(note.content)}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

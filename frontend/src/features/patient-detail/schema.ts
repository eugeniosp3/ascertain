import { z } from 'zod'
import { COMMENT_BODY_MAX, MAX_COMMENT_NOTE_IDS, NOTE_CONTENT_MAX } from '@/api/constraints'
import { toIsoTimestamp } from '@/utils/dates'

export const noteSchema = z.object({
  timestamp: z.string().refine((value) => {
    try {
      return Date.parse(toIsoTimestamp(value)) <= Date.now()
    } catch {
      return false
    }
  }, 'Choose a valid clinical date and time that is not in the future.'),
  content: z
    .string()
    .trim()
    .min(1, 'Write the note before saving.')
    .max(NOTE_CONTENT_MAX, 'Use at most 20,000 characters.'),
})

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a comment before posting.')
    .max(COMMENT_BODY_MAX, 'Use at most 10,000 characters.'),
  note_ids: z
    .array(z.string())
    .max(MAX_COMMENT_NOTE_IDS, `Link at most ${MAX_COMMENT_NOTE_IDS} notes.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Note references must be distinct.'),
})

const NOTE_TITLE_MAX = 80

/**
 * Split a note into a list title and the text that follows it. The title is the first non-empty
 * line; a long line is cut at a word boundary with "…" (never mid-word), and the preview resumes
 * where the title stopped, so no text is shown twice.
 */
function splitNote(content: string): { title: string; rest: string } {
  const lines = content.trim().split('\n')
  const index = lines.findIndex((line) => line.trim())
  if (index === -1) return { title: 'Clinical note', rest: '' }
  const first = lines[index]!.trim()
  const after = lines
    .slice(index + 1)
    .join('\n')
    .trim()
  if (first.length <= NOTE_TITLE_MAX) return { title: first, rest: after }
  const space = first.lastIndexOf(' ', NOTE_TITLE_MAX - 1)
  // Very long unbroken words fall back to a hard cut, still marked with an ellipsis.
  const head = (
    space >= NOTE_TITLE_MAX / 2 ? first.slice(0, space) : first.slice(0, NOTE_TITLE_MAX - 1)
  ).replace(/[\s,;:.\-–—]+$/, '')
  const tail = first.slice(head.length).replace(/^[\s,;:.\-–—]+/, '')
  return { title: `${head}…`, rest: [tail && `…${tail}`, after].filter(Boolean).join('\n') }
}

export function noteLabel(content: string): string {
  return splitNote(content).title
}

/** List preview text after the title; empty when the title already shows the whole note. */
export function notePreview(content: string): string {
  return splitNote(content).rest
}

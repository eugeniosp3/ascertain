import { z } from 'zod'
import { toIsoTimestamp } from '@/utils/dates'

export const noteSchema = z.object({
  timestamp: z.string().refine((value) => {
    try {
      toIsoTimestamp(value)
      return true
    } catch {
      return false
    }
  }, 'Choose a valid clinical date and time.'),
  content: z
    .string()
    .trim()
    .min(1, 'Write the note before saving.')
    .max(20_000, 'Use at most 20,000 characters.'),
})

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a comment before posting.')
    .max(10_000, 'Use at most 10,000 characters.'),
  note_ids: z.array(z.string()).max(20, 'Link at most 20 notes.'),
})

export function fieldMessage(errors: unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === 'string') return error
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    )
      return error.message
  }
}

export function noteLabel(content: string): string {
  return (
    content
      .trim()
      .split('\n')
      .find((line) => line.trim())
      ?.slice(0, 80) || 'Clinical note'
  )
}

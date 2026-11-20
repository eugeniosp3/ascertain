import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoId } from '@/fixtures/demo-data'
import { toDateTimeLocal } from '@/utils/dates'
import { commentSchema, noteLabel, notePreview, noteSchema } from './schema'

afterEach(() => vi.useRealTimers())

describe('clinical note and discussion form validation', () => {
  it('allows 100 distinct note references and rejects overflow or duplicate references', () => {
    const note_ids = Array.from({ length: 100 }, (_, index) => demoId('note', index + 1))
    expect(commentSchema.safeParse({ body: 'x'.repeat(10_000), note_ids }).success).toBe(true)
    expect(
      commentSchema.safeParse({ body: 'Text', note_ids: [...note_ids, demoId('note', 101)] })
        .success,
    ).toBe(false)
    expect(
      commentSchema.safeParse({ body: 'Text', note_ids: [note_ids[0], note_ids[0]] }).success,
    ).toBe(false)
    expect(commentSchema.safeParse({ body: 'x'.repeat(10_001), note_ids: [] }).success).toBe(false)
  })

  it('rejects future local clinical times and preserves the 20,000-character note limit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T15:00:00Z'))
    const timestamp = toDateTimeLocal('2026-11-20T14:59:00Z')
    expect(noteSchema.safeParse({ timestamp, content: 'x'.repeat(20_000) }).success).toBe(true)
    expect(noteSchema.safeParse({ timestamp, content: 'x'.repeat(20_001) }).success).toBe(false)
    expect(
      noteSchema.safeParse({ timestamp: toDateTimeLocal('2026-11-20T15:01:00Z'), content: 'Text' })
        .success,
    ).toBe(false)
    expect(noteSchema.safeParse({ timestamp: '2026-02-30T12:00', content: 'Text' }).success).toBe(
      false,
    )
  })

  it('titles notes at a word boundary with an ellipsis and never repeats the first line', () => {
    const long =
      'Routine visit recorded for blood pressure follow-up, medication reconciliation and dietary counselling'
    const title = noteLabel(`${long}\nPlan: recheck in four weeks.`)
    expect(title.length).toBeLessThanOrEqual(80)
    expect(title).toMatch(/…$/)
    expect(long.startsWith(title.slice(0, -1))).toBe(true)
    // The character after the cut is a space: no word is split.
    expect(long[title.length - 1]).toBe(' ')
    const preview = notePreview(`${long}\nPlan: recheck in four weeks.`)
    expect(preview.startsWith('…')).toBe(true)
    expect(preview).toContain('Plan: recheck in four weeks.')
    expect(preview).not.toContain(title.slice(0, -1))
    expect(noteLabel('Short title\nBody text')).toBe('Short title')
    expect(notePreview('Short title\nBody text')).toBe('Body text')
    expect(notePreview('Only one line')).toBe('')
    expect(noteLabel('   \n  ')).toBe('Clinical note')
    expect(noteLabel('x'.repeat(120))).toBe(`${'x'.repeat(79)}…`)
  })
})

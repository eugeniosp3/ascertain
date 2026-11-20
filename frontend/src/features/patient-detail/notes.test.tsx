import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, ApiError } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { toIsoTimestamp } from '@/utils/dates'
import { NoteForm } from './NoteForm'
import { NoteView } from './NoteView'
import { noteSchema } from './schema'
import { renderFeature } from './test-utils'
import { actorId, patientId, makeNote } from './test-data'

describe('clinical note forms', () => {
  it('validates blank notes and impossible local timestamps', () => {
    expect(noteSchema.safeParse({ content: '   ', timestamp: '2026-11-01T12:00' }).success).toBe(
      false,
    )
    expect(noteSchema.safeParse({ content: 'A note', timestamp: '2026-02-30T12:00' }).success).toBe(
      false,
    )
    expect(noteSchema.safeParse({ content: 'A note', timestamp: '2026-11-01T12:00' }).success).toBe(
      true,
    )
  })

  it('does not write invalid fields, maps server errors, and preserves a failed draft', async () => {
    const user = userEvent.setup()
    const saved = vi.fn()
    const create = vi
      .spyOn(api, 'createNote')
      .mockRejectedValueOnce(
        new ApiError(422, 'validation', 'Check the note.', {
          content: 'Clinical note needs review.',
        }),
      )
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Connection interrupted.'))
      .mockResolvedValue(makeNote())
    renderFeature(
      <NoteForm patientId={patientId} actorId={actorId} onSaved={saved} onCancel={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Write the note before saving.')).toBeVisible()
    expect(create).not.toHaveBeenCalled()
    const content = screen.getByRole('textbox', { name: /^Note/ })
    await user.type(content, 'Patient reports better sleep.')
    const timestamp = screen.getByLabelText('Clinical date and time', { exact: false })
    fireEvent.change(timestamp, { target: { value: '2026-11-01T09:30' } })
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Clinical note needs review.')).toBeVisible()
    expect(content).toHaveValue('Patient reports better sleep.')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Connection interrupted.')).toBeVisible()
    expect(content).toHaveValue('Patient reports better sleep.')
    expect(timestamp).toHaveValue('2026-11-01T09:30')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith(makeNote().id))
    expect(create).toHaveBeenLastCalledWith(
      patientId,
      { content: 'Patient reports better sleep.', timestamp: toIsoTimestamp('2026-11-01T09:30') },
      { actorId },
    )
  })

  it('prevents a second write while a note is saving', async () => {
    const user = userEvent.setup()
    let finish!: (note: ReturnType<typeof makeNote>) => void
    const create = vi.spyOn(api, 'createNote').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    renderFeature(
      <NoteForm patientId={patientId} actorId={actorId} onSaved={vi.fn()} onCancel={vi.fn()} />,
    )
    await user.type(screen.getByRole('textbox', { name: /^Note/ }), 'Pending note')
    await user.dblClick(screen.getByRole('button', { name: 'Save note' }))
    expect(create).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    finish(makeNote())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled())
  })
})

describe('canonical note view', () => {
  it.each([404, 410, 422])('explains a %s note and offers the collection route', async (status) => {
    vi.spyOn(api, 'getNote').mockRejectedValue(
      new ApiError(status, status === 410 ? 'gone' : 'not_found', 'Unavailable'),
    )
    const back = vi.fn()
    renderFeature(
      <NoteView patientId={patientId} actorId={actorId} noteId="missing" onBack={back} />,
    )
    expect(
      await screen.findByRole('heading', {
        name: status === 410 ? 'This note was deleted' : 'Note not found',
      }),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Notes' }))
    expect(back).toHaveBeenCalledOnce()
  })

  it('shows plain note text and only HTTPS file links, and confirms owned deletion', async () => {
    const note = makeNote({
      content: '<script>literal note</script>',
      attachments: [
        { id: 'safe', display_name: 'Lab file', source_url: 'https://files.example.com/lab.pdf' },
        { id: 'bad', display_name: 'Unsafe file', source_url: 'javascript:alert(1)' },
      ],
    })
    vi.spyOn(api, 'getNote').mockResolvedValue(note)
    const remove = vi.spyOn(api, 'deleteNote').mockResolvedValue()
    const back = vi.fn()
    const { client } = renderFeature(
      <NoteView patientId={patientId} actorId={actorId} noteId={note.id} onBack={back} />,
    )
    client.setQueryData(patientKeys.summary(patientId), { summary: 'Old summary' })
    expect(await screen.findByRole('link', { name: /Lab file/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
    expect(screen.queryByRole('link', { name: /Unsafe file/ })).not.toBeInTheDocument()
    expect(screen.getByText('<script>literal note</script>', { selector: 'p' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    expect(remove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(patientId, note.id, { actorId }))
    expect(back).toHaveBeenCalledOnce()
    expect(client.getQueryState(patientKeys.summary(patientId))?.isInvalidated).toBe(true)
  })
})

import { useState } from 'react'
import { createMemoryHistory, Outlet, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from './router'

vi.mock('./AppShell', () => ({ default: () => <Outlet /> }))
vi.mock('./actor-context', () => ({ useActor: () => ({ actorId: 'demo-user' }) }))
vi.mock('@/features/patient-form/PatientFormPage', () => ({ default: () => null }))
vi.mock('@/features/patient-detail/PatientWorkspace', () => ({
  default: function Workspace(props: {
    tab: string
    noteId?: string
    onNoteOpen: (id: string) => void
    onTabChange: (tab: 'discussion') => void
  }) {
    const [draft, setDraft] = useState('')
    return (
      <>
        <label>
          Discussion draft
          <input value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <p>Tab: {props.tab}</p>
        <p>Note: {props.noteId ?? 'none'}</p>
        <button onClick={() => props.onNoteOpen('linked-note')}>Open linked note</button>
        <button onClick={() => props.onTabChange('discussion')}>Return to discussion</button>
      </>
    )
  },
}))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('patient visit route lifetime', () => {
  it('retains the workspace instance and draft across linked-note navigation', async () => {
    const router = createAppRouter(
      createMemoryHistory({
        initialEntries: ['/patients/patient-one?tab=discussion'],
      }),
    )
    render(<RouterProvider router={router} />)
    const draft = await screen.findByRole('textbox', { name: 'Discussion draft' })
    fireEvent.change(draft, { target: { value: 'Keep this draft while checking the note.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open linked note' }))
    await screen.findByText('Note: linked-note')
    expect(screen.getByRole('textbox', { name: 'Discussion draft' })).toBe(draft)
    expect(draft).toHaveValue('Keep this draft while checking the note.')
    fireEvent.click(screen.getByRole('button', { name: 'Return to discussion' }))
    await waitFor(() => expect(screen.getByText('Tab: discussion')).toBeVisible())
    expect(screen.getByText('Note: none')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Discussion draft' })).toBe(draft)
    expect(draft).toHaveValue('Keep this draft while checking the note.')
  })
})

import { useState } from 'react'
import { createMemoryHistory, Outlet, RouterProvider } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from './router'
import { useUIStore } from './ui-store'
import { getListView, rememberPatient, updateListView } from './view-state'
import { defaultListSearch } from '@/features/patient-list/search-params'

vi.mock('./AppShell', () => ({ default: () => <Outlet /> }))
vi.mock('./actor-context', () => ({ useActor: () => ({ actorId: 'demo-user' }) }))
vi.mock('@/features/patient-form/PatientFormPage', () => ({ default: () => null }))
vi.mock('@/routes/patients-list', () => ({ default: () => <h1>Patient list</h1> }))
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
  useUIStore.setState({ returnSnapshots: {} })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('patient visit route lifetime', () => {
  it('re-arms the origin on browser Forward for every subsequent Back', async () => {
    const search = { ...defaultListSearch, q: 'Ada', status: 'active' as const, page: 3 }
    updateListView('patients', 'demo-user', { search, scrollTop: 845 })
    rememberPatient('patients', 'demo-user', 'patient-one', 7, 'notes')
    const snapshot = getListView('patients', 'demo-user')
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/patients'] }))
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { name: 'Patient list' })
    await act(() =>
      router.navigate({
        to: '/patients/$patientId',
        params: { patientId: 'patient-one' },
        search: { ...search, tab: 'notes', returnTo: 'patients' },
        state: { workspaceOrigin: 'patients' },
      }),
    )
    await screen.findByText('Tab: notes')
    for (let visit = 0; visit < 3; visit++) {
      act(() => router.history.back())
      await screen.findByRole('heading', { name: 'Patient list' })
      expect(getListView('patients', 'demo-user')).toEqual(snapshot)
      // PatientResults consumes this request after focusing the originating control.
      updateListView('patients', 'demo-user', { restoreFocus: false })
      if (visit < 2) {
        act(() => router.history.forward())
        await screen.findByText('Tab: notes')
        await waitFor(() => expect(getListView('patients', 'demo-user')).toEqual(snapshot))
      }
    }
  })
  it('does not re-arm a stale origin for a direct workspace URL', async () => {
    rememberPatient('patients', 'demo-user', 'patient-one', 7, 'notes')
    updateListView('patients', 'demo-user', { restoreFocus: false })
    const snapshot = getListView('patients', 'demo-user')
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: ['/patients/patient-one?tab=discussion'] }),
    )
    render(<RouterProvider router={router} />)
    await screen.findByText('Tab: discussion')
    expect(getListView('patients', 'demo-user')).toBe(snapshot)
  })
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

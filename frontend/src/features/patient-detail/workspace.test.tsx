import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { api, ApiError } from '@/api'
import { patientKeys } from '@/app/query-keys'
import PatientWorkspace, { type PatientWorkspaceProps } from './PatientWorkspace'
import { actorId, patientId, patient, makeNote, makeComment, makeCommentPage } from './test-data'
import { renderFeature } from './test-utils'

function props(overrides: Partial<PatientWorkspaceProps> = {}): PatientWorkspaceProps {
  return {
    patientId,
    actorId,
    tab: 'overview',
    onClose: vi.fn(),
    onTabChange: vi.fn(),
    onNoteOpen: vi.fn(),
    onEdit: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(api, 'getPatient').mockResolvedValue(patient)
  vi.spyOn(api, 'listNotes').mockResolvedValue([makeNote()])
  vi.spyOn(api, 'listUsers').mockResolvedValue([{ id: actorId, display_name: 'Sam Rivera' }])
  vi.spyOn(api, 'listComments').mockResolvedValue(makeCommentPage([makeComment()]))
  vi.spyOn(api, 'markCommentsRead').mockResolvedValue({
    patient_id: patientId,
    last_read_at: '2026-11-01T14:30:01.123456+00:00',
  })
})

describe('patient workspace routes and visit state', () => {
  it('does not reveal denied cached content after Retry later fails with a network error', async () => {
    const { client } = renderFeature(<PatientWorkspace {...props()} />)
    await screen.findByRole('heading', { name: 'Ada J Rivera' })
    vi.mocked(api.getPatient).mockRejectedValueOnce(
      new ApiError(403, 'forbidden', 'Access denied.'),
    )
    await act(async () => {
      await client.invalidateQueries({ queryKey: patientKeys.detail(patientId, actorId) })
    })
    expect(await screen.findByText('Access denied.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Ada J Rivera' })).not.toBeInTheDocument()
    vi.mocked(api.getPatient).mockRejectedValueOnce(
      new ApiError(503, 'network', 'Temporary failure.'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Temporary failure.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Ada J Rivera' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Ada J Rivera' })).toBeVisible()
  })
  it('keeps a mounted note draft during a failed patient refresh and its retry', async () => {
    const { client } = renderFeature(<PatientWorkspace {...props({ tab: 'notes' })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    const draft = screen.getByRole('textbox', { name: /^Note/ })
    await userEvent.type(draft, 'Keep this clinical draft through a temporary outage.')
    vi.mocked(api.getPatient).mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Offline'))
    await act(async () => {
      await client.invalidateQueries({ queryKey: patientKeys.detail(patientId, actorId) })
    })
    expect(await screen.findByText(/Your draft is still here/)).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^Note/ })).toBe(draft)
    expect(draft).toHaveValue('Keep this clinical draft through a temporary outage.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.queryByText(/Your draft is still here/)).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('textbox', { name: /^Note/ })).toBe(draft)
    expect(draft).toHaveValue('Keep this clinical draft through a temporary outage.')
  })
  it('opens with a focused identity heading, leaves other tabs unread, and uses callbacks for navigation and Escape', async () => {
    const mark = vi.spyOn(api, 'markCommentsRead')
    const getSummary = vi.spyOn(api, 'getSummary').mockResolvedValue({
      patient_id: patientId,
      summary: 'Clinical summary',
      generated_at: patient.created_at,
      method: 'template',
    })
    const callbacks = props()
    const { rerender, client } = renderFeature(<PatientWorkspace {...callbacks} />)
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: 'Ada J Rivera' })).toHaveFocus()
    expect(within(dialog).getByRole('tab', { name: /Discussion.*1 unread comment$/ })).toBeVisible()
    expect(mark).not.toHaveBeenCalled()
    expect(api.listComments).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('tab', { name: /Notes/ }))
    expect(callbacks.onTabChange).toHaveBeenCalledWith('notes')
    rerender(
      <QueryClientProvider client={client}>
        <PatientWorkspace {...callbacks} tab="notes" />
      </QueryClientProvider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Follow-up visit/ }))
    expect(callbacks.onNoteOpen).toHaveBeenCalledWith(makeNote().id)
    rerender(
      <QueryClientProvider client={client}>
        <PatientWorkspace {...callbacks} tab="summary" />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Clinical summary')).toBeVisible()
    expect(getSummary).toHaveBeenCalledOnce()
    expect(mark).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(callbacks.onClose).toHaveBeenCalledOnce()
  })

  it('preserves a note draft across tab changes in one visit', async () => {
    const callbacks = props({ tab: 'notes' })
    const { rerender, client } = renderFeature(<PatientWorkspace {...callbacks} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Note/ }),
      'Visit-only clinical draft',
    )
    rerender(
      <QueryClientProvider client={client}>
        <PatientWorkspace {...callbacks} tab="overview" />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('textbox', { name: /^Note/ })).not.toBeInTheDocument()
    rerender(
      <QueryClientProvider client={client}>
        <PatientWorkspace {...callbacks} tab="notes" />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('textbox', { name: /^Note/ })).toHaveValue('Visit-only clinical draft')
  })

  it('compacts only the detail scroller with enough room and restores identity at the top', async () => {
    const { container } = renderFeature(<PatientWorkspace {...props()} />)
    await screen.findByRole('heading', { name: 'Ada J Rivera' })
    const scroller = document.querySelector('.pw-scroll') as HTMLDivElement
    const identity = document.querySelector('.pw-identity')!
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true })
    fireEvent.scroll(scroller, { target: { scrollTop: 70 } })
    expect(identity).toHaveAttribute('data-compact', 'true')
    fireEvent.scroll(scroller, { target: { scrollTop: 30 } })
    expect(identity).toHaveAttribute('data-compact', 'true')
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } })
    expect(identity).toHaveAttribute('data-compact', 'false')
    expect(container.querySelector('.pw-decor')).toHaveAttribute('inert')
    expect(container.querySelector('.pw-decor')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows a missing patient inside the accessible dialog with a close action', async () => {
    vi.mocked(api.getPatient).mockRejectedValue(new ApiError(404, 'not_found', 'Missing'))
    const callbacks = props()
    renderFeature(<PatientWorkspace {...callbacks} />)
    expect(await screen.findByRole('heading', { name: 'Patient not found' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close patient workspace' }))
    expect(callbacks.onClose).toHaveBeenCalledOnce()
    await waitFor(() => expect(api.getPatient).toHaveBeenCalledOnce())
  })

  it('treats a malformed patient ID (422) as not found, with a way back and no retry', async () => {
    vi.mocked(api.getPatient).mockRejectedValue(
      new ApiError(422, 'validation', 'Request validation failed.'),
    )
    const callbacks = props()
    renderFeature(<PatientWorkspace {...callbacks} />)
    expect(await screen.findByRole('heading', { name: 'Patient not found' })).toBeVisible()
    expect(screen.queryByText('Request validation failed.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }))
    expect(callbacks.onClose).toHaveBeenCalledOnce()
  })
})

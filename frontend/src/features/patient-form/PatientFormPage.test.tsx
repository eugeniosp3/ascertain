import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { api, ApiError } from '@/api'
import type { PatientDetail } from '@/api/types'
import { patientKeys } from '@/app/query-keys'
import { emptyPatientValues, toPatientWrite } from './mapping'
import { PatientForm } from './PatientForm'
import PatientFormPage, { type PatientFormPageProps } from './PatientFormPage'

const actorId = '40000000-0000-4000-8000-000000000001'
const write = toPatientWrite({
  ...emptyPatientValues(),
  first_name: 'Ada',
  middle_initial: 'J',
  last_name: 'Example',
  date_of_birth: '1980-01-02',
  phone: '+1 (212) 555-0100',
  email: 'ada@example.com',
  address_line1: '1 Example Lane',
  address_line2: 'Unit 2',
  city: 'Albany',
  state: 'NY',
  postal_code: '01234',
  last_visit: '2020-02-29',
  conditions: [{ code: 'I10', label: 'Example condition' }],
  allergies: ['Example allergen'],
  allergy_status: 'reported',
})
const patient: PatientDetail = {
  ...write,
  id: '10000000-0000-4000-8000-000000000001',
  mrn: '01000001',
  source_patient_id: 'PT-0001',
  name: 'Ada J Example',
  age: 46,
  notes_count: 4,
  comments_count: 3,
  unread_comments_count: 1,
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const clients: QueryClient[] = []
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

beforeAll(() => {
  // Radix focuses options by scrolling them; jsdom does not provide scrolling layout.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterAll(() => {
  if (originalScrollIntoView)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

function renderPage(overrides: Partial<PatientFormPageProps> = {}, client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    })
  clients.push(queryClient)
  const props = { actorId, onCancel: vi.fn(), onSaved: vi.fn(), ...overrides }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <PatientFormPage {...props} />
    </QueryClientProvider>,
  )
  return {
    ...view,
    props,
    client: queryClient,
    rerenderPage: (changes: Partial<PatientFormPageProps>) =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <PatientFormPage {...props} {...changes} />
        </QueryClientProvider>,
      ),
  }
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: 'Example' } })
  fireEvent.change(screen.getByLabelText(/^Date of birth/), { target: { value: '1980-01-02' } })
}

beforeEach(() => {
  vi.spyOn(api, 'getPatient').mockResolvedValue(patient)
  vi.spyOn(api, 'createPatient').mockResolvedValue(patient)
  vi.spyOn(api, 'updatePatient').mockResolvedValue(patient)
  vi.spyOn(toast, 'success').mockImplementation(() => 'toast-id')
})

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})

describe('composable patient form', () => {
  it('keeps a newer detail refetch instead of overwriting it with the PUT snapshot', async () => {
    vi.mocked(api.getPatient)
      .mockResolvedValueOnce(patient)
      .mockResolvedValue({ ...patient, unread_comments_count: 2 })
    vi.mocked(api.updatePatient).mockResolvedValue({ ...patient, unread_comments_count: 0 })
    const { client, props } = renderPage({ patientId: patient.id })
    await screen.findByRole('button', { name: 'Save changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce())
    expect(client.getQueryData(patientKeys.detail(patient.id, actorId))).toMatchObject({
      unread_comments_count: 2,
    })
  })
  it('starts empty and validates on blur and submit with associated plain-language errors', async () => {
    const onSave = vi.fn()
    render(<PatientForm onSave={onSave} onCancel={vi.fn()} />)
    const first = screen.getByLabelText(/^First name/)
    expect(first).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Unknown' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Patient status' })).toHaveTextContent('Active')
    expect(screen.getByRole('combobox', { name: 'Blood type' })).toHaveTextContent('Unknown')
    const user = userEvent.setup()
    await user.click(first)
    await user.tab()
    expect(await screen.findByText('Enter a first name.')).toBeVisible()
    expect(first).toHaveAttribute('aria-invalid', 'true')
    expect(first).toHaveAccessibleDescription('Enter a first name.')
    await user.click(screen.getByRole('button', { name: 'Add patient' }))
    expect(await screen.findByText('Enter a last name.')).toBeVisible()
    expect(screen.getByText('Enter a valid date.')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('requires reported allergies and supports keyboard add/remove without comma parsing', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PatientForm onSave={onSave} onCancel={vi.fn()} />)
    fillRequired()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Reported allergies' }))
    await user.click(screen.getByRole('button', { name: 'Add patient' }))
    expect(await screen.findByText('Add at least one reported allergy.')).toBeVisible()
    screen.getByRole('button', { name: 'Add allergy' }).focus()
    await user.keyboard('{Enter}')
    await user.type(screen.getByLabelText(/^Allergy 1/), 'Example, with punctuation')
    await user.click(screen.getByRole('button', { name: 'Add condition' }))
    await user.type(screen.getByLabelText(/^Condition 1 label/), 'Example condition')
    await user.type(screen.getByLabelText('Condition 1 code'), 'X01')
    await user.click(screen.getByRole('button', { name: 'Add condition' }))
    await user.click(screen.getByRole('button', { name: 'Remove condition 2' }))
    await user.click(screen.getByRole('button', { name: 'Add patient' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          allergies: ['Example, with punctuation'],
          conditions: [{ code: 'X01', label: 'Example condition' }],
          allergy_status: 'reported',
        }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Remove allergy 1' }))
    expect(screen.queryByLabelText(/^Allergy 1/)).not.toBeInTheDocument()
  })

  it('clears the reported list explicitly when choosing a known absence', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PatientForm patient={patient} onSave={onSave} onCancel={vi.fn()} />)
    expect(screen.getByText(/clears the reported list/)).toBeVisible()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'No known allergies' }))
    expect(screen.queryByLabelText(/^Allergy 1/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ allergy_status: 'no_known', allergies: [] }),
      ),
    )
    await user.click(screen.getByRole('radio', { name: 'Reported allergies' }))
    expect(screen.queryByLabelText(/^Allergy 1/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Add at least one reported allergy.')).toBeVisible()
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('validates a future birth date and invalid contact fields before sending a write', async () => {
    const onSave = vi.fn()
    render(<PatientForm onSave={onSave} onCancel={vi.fn()} />)
    fillRequired()
    fireEvent.change(screen.getByLabelText(/^Date of birth/), { target: { value: '2999-01-01' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid-email' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'invalid-phone' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add patient' }))
    expect(await screen.findByText('Date cannot be in the future.')).toBeVisible()
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    )
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription(
      'Enter a valid phone number.',
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('changes status and blood type using the keyboard', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PatientForm onSave={onSave} onCancel={vi.fn()} />)
    fillRequired()
    const user = userEvent.setup()
    const status = screen.getByRole('combobox', { name: 'Patient status' })
    status.focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: /^Active$/ })).toHaveFocus())
    await user.keyboard('{ArrowDown}{Enter}')
    expect(status).toHaveTextContent('Inactive')
    const blood = screen.getByRole('combobox', { name: 'Blood type' })
    blood.focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Unknown' })).toHaveFocus())
    await user.keyboard('{ArrowDown}{Enter}')
    expect(blood).toHaveTextContent('A+')
    await user.click(screen.getByRole('button', { name: 'Add patient' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'inactive', blood_type: 'A+' }),
      ),
    )
  })

  it('keeps each remaining condition paired with its code after removing an earlier row', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <PatientForm
        patient={{
          ...patient,
          conditions: [...patient.conditions, { code: 'X02', label: 'Second condition' }],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Remove condition 1' }))
    expect(screen.getByLabelText(/^Condition 1 label/)).toHaveValue('Second condition')
    expect(screen.getByLabelText('Condition 1 code')).toHaveValue('X02')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ conditions: [{ code: 'X02', label: 'Second condition' }] }),
      ),
    )
  })
})

describe('patient form page integration', () => {
  it('waits for invalidation to settle before calling onSaved', async () => {
    let finishInvalidation!: () => void
    const invalidation = new Promise<void>((resolve) => {
      finishInvalidation = resolve
    })
    const { props, client } = renderPage()
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockReturnValue(invalidation)
    fillRequired()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add patient' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalled())
    expect(api.createPatient).toHaveBeenCalledTimes(1)
    expect(props.onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await act(async () => {
      finishInvalidation()
    })
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(patient))
  })

  it('creates only after confirmed success, disables repeat submits and invalidates before onSaved', async () => {
    let resolveSave!: (value: PatientDetail) => void
    vi.mocked(api.createPatient).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    const { props, client } = renderPage()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    fillRequired()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add patient' }))
    await waitFor(() => expect(api.createPatient).toHaveBeenCalledTimes(1))
    const pending = screen.getByRole('button', { name: 'Saving…' })
    expect(pending).toBeDisabled()
    expect(screen.getByLabelText(/^First name/)).toBeDisabled()
    await user.click(pending)
    expect(api.createPatient).toHaveBeenCalledTimes(1)
    expect(props.onSaved).not.toHaveBeenCalled()
    expect(api.getPatient).not.toHaveBeenCalled()
    expect(api.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Ada',
        middle_initial: null,
        blood_type: null,
        allergy_status: 'unknown',
        conditions: [],
        allergies: [],
      }),
      { actorId },
    )
    await act(async () => {
      resolveSave(patient)
    })
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(patient))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['patients', 'list'] })
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(props.onSaved).mock.invocationCallOrder[0]!,
    )
    expect(client.getQueryData(patientKeys.detail(patient.id, actorId))).toEqual(patient)
    expect(toast.success).toHaveBeenCalledWith('Patient added.')
  })

  it('loads edit independently and sends a complete replacement retaining codes, nulls and date-only fields', async () => {
    const { props, client } = renderPage({ patientId: patient.id })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await screen.findByLabelText(/^First name/)
    expect(api.getPatient).toHaveBeenCalledWith(patient.id, {
      actorId,
      signal: expect.any(AbortSignal),
    })
    expect(screen.getByText('MRN 01000001 · Source ID PT-0001')).toBeVisible()
    fireEvent.change(screen.getByLabelText(/^Condition 1 label/), {
      target: { value: 'Updated label' },
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(patient))
    expect(api.updatePatient).toHaveBeenCalledWith(
      patient.id,
      { ...write, conditions: [{ code: 'I10', label: 'Updated label' }] },
      { actorId },
    )
    expect(api.createPatient).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: patientKeys.detail(patient.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: patientKeys.summary(patient.id) })
    expect(client.getQueryData(patientKeys.detail(patient.id, actorId))).toEqual(patient)
  })

  it.each([
    new ApiError(0, 'network_error', 'Connection unavailable.'),
    new ApiError(403, 'forbidden', 'You cannot edit this patient.'),
    new ApiError(409, 'conflict', 'The patient could not be updated.'),
  ])('preserves every edited value after a $kind failure and permits retry', async (error) => {
    vi.mocked(api.updatePatient).mockRejectedValueOnce(error).mockResolvedValueOnce(patient)
    const { props } = renderPage({ patientId: patient.id })
    await screen.findByLabelText(/^First name/)
    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Unsaved name' } })
    fireEvent.change(screen.getByLabelText('Address line 2'), { target: { value: 'Unit 009' } })
    fireEvent.change(screen.getByLabelText(/^Condition 1 label/), {
      target: { value: 'Unsaved condition' },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(error.message)).toBeVisible()
    expect(screen.getByLabelText(/^First name/)).toHaveValue('Unsaved name')
    expect(screen.getByLabelText('Address line 2')).toHaveValue('Unit 009')
    expect(screen.getByLabelText(/^Condition 1 label/)).toHaveValue('Unsaved condition')
    expect(screen.getByLabelText('Condition 1 code')).toHaveValue('I10')
    expect(props.onSaved).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(patient))
  })

  it('maps server 422 nested fields to inputs and unknown paths to the form alert', async () => {
    vi.mocked(api.updatePatient).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Request validation failed.', {
        'conditions[0].label': 'This condition label is unavailable.',
        'allergies[0]': 'Confirm this allergen.',
        email: 'Use an approved email address.',
        'path.id': 'The record identifier needs attention.',
      }),
    )
    const { props } = renderPage({ patientId: patient.id })
    await screen.findByLabelText(/^First name/)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('This condition label is unavailable.')).toBeVisible()
    const condition = screen.getByLabelText(/^Condition 1 label/)
    expect(condition).toHaveAttribute('aria-invalid', 'true')
    expect(condition).toHaveAccessibleDescription('This condition label is unavailable.')
    expect(screen.getByLabelText(/^Allergy 1/)).toHaveAccessibleDescription(
      'Confirm this allergen.',
    )
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Use an approved email address.',
    )
    expect(
      screen.getByText(/Request validation failed\. The record identifier needs attention\./),
    ).toBeVisible()
    expect(props.onSaved).not.toHaveBeenCalled()
    expect(condition).toHaveValue('Example condition')
    fireEvent.change(condition, { target: { value: 'Corrected label' } })
    expect(screen.queryByText('This condition label is unavailable.')).not.toBeInTheDocument()
  })

  it('retains a dirty draft across background refetch and scopes its query to the actor', async () => {
    const { client } = renderPage({ patientId: patient.id })
    await screen.findByLabelText(/^First name/)
    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'My draft' } })
    vi.mocked(api.getPatient).mockResolvedValue({ ...patient, first_name: 'Server update' })
    await act(async () => {
      await client.invalidateQueries({ queryKey: patientKeys.detail(patient.id, actorId) })
    })
    expect(screen.getByLabelText(/^First name/)).toHaveValue('My draft')
    expect(client.getQueryData(patientKeys.detail(patient.id, actorId))).toEqual(
      expect.objectContaining({ first_name: 'Server update' }),
    )
  })

  it('shows an array-level server error even when the reported allergy editor is closed', async () => {
    vi.mocked(api.createPatient).mockRejectedValue(
      new ApiError(422, 'validation_error', 'Request validation failed.', {
        allergies: 'Reconfirm the allergy information.',
      }),
    )
    renderPage()
    fillRequired()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add patient' }))
    expect(await screen.findByText('Reconfirm the allergy information.')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Unknown' })).toBeChecked()
    expect(screen.getByLabelText(/^First name/)).toHaveValue('Ada')
  })

  it('clears a draft on actor switch and ignores the old save completion for navigation', async () => {
    let resolveSave!: (value: PatientDetail) => void
    vi.mocked(api.createPatient).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve
      }),
    )
    const { props, rerenderPage } = renderPage()
    fillRequired()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add patient' }))
    await waitFor(() => expect(api.createPatient).toHaveBeenCalledTimes(1))
    rerenderPage({ actorId: 'second-actor' })
    expect(screen.getByLabelText(/^First name/)).toHaveValue('')
    await act(async () => {
      resolveSave(patient)
    })
    expect(api.createPatient).toHaveBeenCalledWith(expect.any(Object), { actorId })
    expect(props.onSaved).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('renders loading, read failure with retry, and a clear 404 state with Back', async () => {
    let rejectRead!: (reason: unknown) => void
    vi.mocked(api.getPatient).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectRead = reject
      }),
    )
    const { props } = renderPage({ patientId: patient.id })
    expect(screen.getByRole('status')).toHaveTextContent('Loading patient…')
    expect(screen.queryByLabelText(/^First name/)).not.toBeInTheDocument()
    await act(async () => {
      rejectRead(new ApiError(0, 'network_error', 'Could not load patient.'))
    })
    expect(await screen.findByText('Could not load patient.')).toBeVisible()
    vi.mocked(api.getPatient).mockRejectedValueOnce(
      new ApiError(404, 'not_found', 'Patient not found.'),
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByText('Patient not found. This record may have been removed.'),
    ).toBeVisible()
    expect(screen.queryByLabelText(/^First name/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('removes an existing draft if a refetch confirms the patient was removed', async () => {
    const { client } = renderPage({ patientId: patient.id })
    await screen.findByLabelText(/^First name/)
    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Stale draft' } })
    vi.mocked(api.getPatient).mockRejectedValueOnce(
      new ApiError(404, 'not_found', 'Patient not found.'),
    )
    await act(async () => {
      await client.invalidateQueries({ queryKey: patientKeys.detail(patient.id, actorId) })
    })
    expect(
      await screen.findByText('Patient not found. This record may have been removed.'),
    ).toBeVisible()
    expect(screen.queryByLabelText(/^First name/)).not.toBeInTheDocument()
    expect(screen.queryByText('MRN 01000001 · Source ID PT-0001')).not.toBeInTheDocument()
  })

  it('both Cancel actions return without saving', async () => {
    const { props } = renderPage()
    fillRequired()
    const user = userEvent.setup()
    const actions = screen.getAllByRole('button', { name: 'Cancel' })
    await user.click(actions[0]!)
    await user.click(actions[1]!)
    expect(props.onCancel).toHaveBeenCalledTimes(2)
    expect(api.createPatient).not.toHaveBeenCalled()
  })
})

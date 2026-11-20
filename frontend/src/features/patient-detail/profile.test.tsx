import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, ApiError, type PatientSummary, type ProfileDetails } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { ProfilePanel, SourceDetails } from './ProfilePanel'
import { AI_SUMMARY_HINT, SummaryPanel } from './SummaryPanel'
import { patient, actorId, patientId } from './test-data'
import { renderFeature } from './test-utils'

const source: ProfileDetails = {
  identity: {
    age_years: 45,
    sex_at_birth: 'Female',
    gender_identity: 'Woman',
    race: 'Asian',
    ethnicity: 'Not Hispanic',
    preferred_language: 'Spanish',
    interpreter_needed: true,
    marital_status: 'Married',
    employment_status: 'Employed',
  },
  contact: {
    home_phone: null,
    mobile_phone: '555-0100',
    emergency_contact_name: 'Taylor Rivera',
    emergency_contact_relationship: 'Sibling',
    emergency_contact_phone: '555-0101',
  },
  care_team: {
    pcp_name: 'Dr. Jordan Smith',
    pcp_npi: '0001234567',
    home_facility_key: 'FAC-12',
    first_registered_date: '2020-02-01',
  },
  coverage: {
    primary_payer_name: 'Sample Health',
    primary_line_of_business: 'Commercial',
    primary_plan_name: 'Gold HMO',
    primary_plan_type: 'HMO',
    primary_member_id: '00000123',
    primary_group_number: '001',
    primary_coverage_effective_date: '2026-01-01',
    secondary_payer_name: null,
    secondary_member_id: null,
  },
  clinical: {
    primary_clinical_story: 'Source history from referral.',
    height_cm: '160.00',
    weight_kg: '70.10',
    bmi: '27.38',
    smoking_status: 'Never',
    alcohol_use: 'None',
    has_hypertension: true,
    has_diabetes: 'Type 2',
    has_ckd: false,
    has_copd: false,
    has_heart_failure: false,
    has_cad: false,
    has_afib: false,
    has_osa: false,
    has_depression: false,
    has_obesity: false,
    has_cancer_history: false,
    charlson_comorbidity_index: 2,
    active_medications: 'Metformin 500 mg',
  },
  labs: {
    last_labs_date: '2026-10-01',
    last_hba1c_pct: '6.40',
    last_egfr: 89,
    last_creatinine_mg_dl: '0.80',
    last_ldl_mg_dl: 98,
    last_hemoglobin_g_dl: '12.90',
    hospitalizations_12mo: 0,
    ed_visits_12mo: 1,
  },
  social: {
    housing_status: 'Stable housing',
    transportation_barrier: false,
    advance_directive_on_file: true,
    code_status: 'Full code',
    pa_request_count: 3,
  },
}

describe('patient profile and imported context', () => {
  it('distinguishes unknown blood/allergies from no known allergies and preserves address and condition codes', () => {
    const { unmount } = renderFeature(
      <ProfilePanel patient={patient} actorId={actorId} onEdit={vi.fn()} onDeleted={vi.fn()} />,
    )
    expect(screen.getByText('Unknown')).toBeVisible()
    expect(screen.getByText('Unknown (not yet recorded)')).toBeVisible()
    expect(screen.getByText('I10')).toBeVisible()
    expect(screen.getByText(/123 Main Street/)).toHaveTextContent('Unit 2')
    expect(screen.getByText(/123 Main Street/)).toHaveTextContent('01234')
    expect(screen.getByText('No visit recorded')).toBeVisible()
    unmount()
    renderFeature(
      <ProfilePanel
        patient={{ ...patient, allergy_status: 'no_known' }}
        actorId={actorId}
        onEdit={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )
    expect(screen.getByText('No known allergies')).toBeVisible()
    expect(screen.queryByText('Unknown (not yet recorded)')).not.toBeInTheDocument()
  })

  it('renders every named source section with exact decimals, identifiers and readable boolean values', () => {
    renderFeature(<SourceDetails details={source} />)
    const context = screen.getByRole('region', { name: 'Imported source context' })
    for (const title of [
      'Source demographics',
      'Source contacts',
      'Care team',
      'Coverage',
      'Clinical context',
      'Labs and utilization',
      'Social and care preferences',
    ])
      expect(within(context).getByRole('heading', { name: title })).toBeVisible()
    for (const value of [
      'Spanish',
      'Taylor Rivera',
      'Dr. Jordan Smith',
      '0001234567',
      '00000123',
      'Source history from referral.',
      '70.10 kg',
      '6.40%',
      'Metformin 500 mg',
      'Full code',
    ])
      expect(within(context).getByText(value)).toBeVisible()
    expect(within(context).getAllByText('Yes').length).toBeGreaterThan(1)
    expect(within(context).getAllByText('No').length).toBeGreaterThan(1)
    expect(within(context).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('uses callbacks for edit and deletes only after confirmation', async () => {
    const edit = vi.fn()
    const deleted = vi.fn()
    const remove = vi.spyOn(api, 'deletePatient').mockResolvedValue()
    renderFeature(
      <ProfilePanel patient={patient} actorId={actorId} onEdit={edit} onDeleted={deleted} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Edit patient' }))
    expect(edit).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Delete patient' }))
    expect(remove).not.toHaveBeenCalled()
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete patient' }),
    )
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    expect(remove).toHaveBeenCalledWith(patientId, { actorId })
  })

  it('drops only the deleted patient records and refreshes lists and notifications', async () => {
    vi.spyOn(api, 'deletePatient').mockResolvedValue()
    const deleted = vi.fn()
    const { client } = renderFeature(
      <ProfilePanel patient={patient} actorId={actorId} onEdit={vi.fn()} onDeleted={deleted} />,
    )
    const otherNotes = patientKeys.notes('another-patient')
    client.setQueryData(patientKeys.detail(patientId, actorId), patient)
    client.setQueryData(patientKeys.notes(patientId), [])
    client.setQueryData(patientKeys.comments(patientId, actorId), {})
    client.setQueryData(otherNotes, [])
    client.setQueryData(patientKeys.lists(actorId), [])
    client.setQueryData(patientKeys.notificationSummary(actorId), {})
    await userEvent.click(screen.getByRole('button', { name: 'Delete patient' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete patient' }),
    )
    await waitFor(() =>
      expect(client.getQueryState(patientKeys.notificationSummary(actorId))?.isInvalidated).toBe(
        true,
      ),
    )
    expect(client.getQueryData(patientKeys.detail(patientId, actorId))).toBeUndefined()
    expect(client.getQueryData(patientKeys.notes(patientId))).toBeUndefined()
    expect(client.getQueryData(patientKeys.comments(patientId, actorId))).toBeUndefined()
    expect(client.getQueryData(otherNotes)).toEqual([])
    expect(client.getQueryState(patientKeys.lists(actorId))?.isInvalidated).toBe(true)
    expect(deleted).toHaveBeenCalledOnce()
  })
})

it('retries the separate summary query and renders returned text literally', async () => {
  const getSummary = vi
    .spyOn(api, 'getSummary')
    .mockRejectedValueOnce(new ApiError(0, 'network', 'Summary connection failed.'))
    .mockResolvedValue({
      patient_id: patientId,
      summary: '<b>Plain clinical summary</b>',
      generated_at: patient.created_at,
      method: 'template',
    })
  renderFeature(<SummaryPanel patientId={patientId} actorId={actorId} />)
  expect(await screen.findByText('Summary connection failed.')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('<b>Plain clinical summary</b>')).toBeVisible()
  expect(getSummary).toHaveBeenCalledTimes(2)
  // Template fallback: plain "Summary" heading, no sparkles, and an honest explanation.
  expect(screen.getByRole('heading', { name: 'Summary' })).toBeVisible()
  expect(screen.getByText('AI summary unavailable — showing the standard summary.')).toBeVisible()
  expect(screen.getByText(/^Updated$/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'About AI summaries' })).not.toBeInTheDocument()
})

it('explains the wait, then marks an AI summary with a keyboard-reachable sparkles tooltip', async () => {
  let resolve!: (value: PatientSummary) => void
  vi.spyOn(api, 'getSummary').mockReturnValue(new Promise((done) => (resolve = done)))
  renderFeature(<SummaryPanel patientId={patientId} actorId={actorId} />)
  expect(screen.getByRole('status', { name: 'Loading summary' })).toHaveTextContent(
    'Generating the summary. This can take a few seconds.',
  )
  resolve({
    patient_id: patientId,
    summary: 'Model-written summary',
    generated_at: patient.created_at,
    method: 'llm',
    model: 'gemma-3-27b',
  })
  expect(await screen.findByText('Model-written summary')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'AI summary' })).toBeVisible()
  expect(screen.getByText(/^Updated$/)).toHaveTextContent(/^Updated \w{3} \d{1,2}, \d{4}/)
  expect(screen.queryByText(/AI summary unavailable/)).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: 'About AI summaries' })
  await userEvent.tab()
  expect(trigger).toHaveFocus()
  expect(await screen.findByRole('tooltip')).toHaveTextContent(AI_SUMMARY_HINT)
})

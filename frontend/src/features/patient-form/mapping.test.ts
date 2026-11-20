import { describe, expect, it } from 'vitest'
import type { PatientDetail, PatientWrite } from '@/api/types'
import { emptyPatientValues, patientToFormValues, toPatientWrite } from './mapping'

const write: PatientWrite = {
  first_name: 'Ada',
  middle_initial: 'J',
  last_name: 'Example',
  date_of_birth: '1980-01-02',
  phone: '+1 (212) 555-0100',
  email: 'ada@example.com',
  address_line1: '10 Example Lane',
  address_line2: 'Unit 2',
  city: 'Albany',
  state: 'NY',
  postal_code: '01234',
  blood_type: 'AB-',
  status: 'inactive',
  last_visit: '2020-02-29',
  conditions: [
    { code: 'I10', label: 'Example condition' },
    { code: null, label: 'Uncoded condition' },
  ],
  allergies: ['Example allergen'],
  allergy_status: 'reported',
}

const detail: PatientDetail = {
  ...write,
  id: 'patient-id',
  source_patient_id: 'PT-0001',
  mrn: '01000001',
  name: 'Ada J Example',
  age: 46,
  notes_count: 4,
  comments_count: 3,
  unread_comments_count: 1,
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  profile_details: {
    care_team: {
      pcp_name: 'Example PCP',
      pcp_npi: '0000000000',
      home_facility_key: 'DEMO',
      first_registered_date: '2020-01-01',
    },
  },
}

describe('patient write mapping', () => {
  it('round trips a complete PUT while excluding source, derived, audit and profile context', () => {
    const values = patientToFormValues(detail)
    const withUntrustedExtras = {
      ...values,
      id: detail.id,
      mrn: detail.mrn,
      profile_details: detail.profile_details,
    }
    const result = toPatientWrite(withUntrustedExtras)
    expect(result).toEqual(write)
    expect(Object.keys(result).sort()).toEqual(Object.keys(write).sort())
    expect(values.conditions).not.toBe(detail.conditions)
    expect(values.allergies).not.toBe(detail.allergies)
    values.conditions[0]!.label = 'Changed label'
    expect(detail.conditions[0]!.label).toBe('Example condition')
    expect(toPatientWrite(values).conditions[0]).toEqual({ code: 'I10', label: 'Changed label' })
  })

  it('normalizes every blank nullable input to null and keeps lists as empty arrays', () => {
    const result = toPatientWrite({
      ...emptyPatientValues(),
      first_name: ' Ada ',
      last_name: ' Example ',
      date_of_birth: '1980-01-02',
      phone: '  ',
      email: ' ',
    })
    expect(result).toEqual({
      first_name: 'Ada',
      middle_initial: null,
      last_name: 'Example',
      date_of_birth: '1980-01-02',
      phone: null,
      email: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      blood_type: null,
      status: 'active',
      last_visit: null,
      conditions: [],
      allergies: [],
      allergy_status: 'unknown',
    })
  })

  it('round trips explicit nulls without shifting calendar dates', () => {
    const nullableDetail = {
      ...detail,
      middle_initial: null,
      phone: null,
      email: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      blood_type: null,
      last_visit: null,
      conditions: [],
      allergies: [],
      allergy_status: 'no_known' as const,
    }
    const result = toPatientWrite(patientToFormValues(nullableDetail))
    expect(result).toEqual({
      ...write,
      middle_initial: null,
      phone: null,
      email: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      blood_type: null,
      last_visit: null,
      conditions: [],
      allergies: [],
      allergy_status: 'no_known',
    })
    expect(result.date_of_birth).toBe('1980-01-02')
  })
})

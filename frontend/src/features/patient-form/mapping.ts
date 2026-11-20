import type { PatientDetail, PatientWrite } from '@/api/types'
import { patientFormSchema, type PatientFormValues } from './schema'

export function emptyPatientValues(): PatientFormValues {
  return {
    first_name: '',
    middle_initial: '',
    last_name: '',
    date_of_birth: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    blood_type: '',
    status: 'active',
    last_visit: '',
    conditions: [],
    allergies: [],
    allergy_status: 'unknown',
  }
}

// Read mapping: HTML inputs use strings, so nullable API values become editable empty strings.
export function patientToFormValues(patient: PatientDetail): PatientFormValues {
  return {
    first_name: patient.first_name,
    middle_initial: patient.middle_initial ?? '',
    last_name: patient.last_name,
    date_of_birth: patient.date_of_birth,
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    address_line1: patient.address_line1 ?? '',
    address_line2: patient.address_line2 ?? '',
    city: patient.city ?? '',
    state: patient.state ?? '',
    postal_code: patient.postal_code ?? '',
    // The read DTO permits string; validation keeps an unsupported value visible as an error.
    blood_type: (patient.blood_type ?? '') as PatientFormValues['blood_type'],
    status: patient.status,
    last_visit: patient.last_visit ?? '',
    conditions: patient.conditions.map(({ code, label }) => ({ code: code ?? '', label })),
    allergies: [...patient.allergies],
    allergy_status: patient.allergy_status,
  }
}

const nullable = (value: string) => value.trim() || null

/** Write mapping: build the full editable PUT body, keeping source, derived and audit fields out. */
export function toPatientWrite(input: PatientFormValues): PatientWrite {
  const value = patientFormSchema.parse(input)
  return {
    first_name: value.first_name,
    middle_initial: nullable(value.middle_initial),
    last_name: value.last_name,
    date_of_birth: value.date_of_birth,
    phone: nullable(value.phone),
    email: nullable(value.email),
    address_line1: nullable(value.address_line1),
    address_line2: nullable(value.address_line2),
    city: nullable(value.city),
    state: nullable(value.state),
    postal_code: nullable(value.postal_code),
    blood_type: value.blood_type || null,
    status: value.status,
    last_visit: value.last_visit || null,
    conditions: value.conditions.map(({ code, label }) => ({ code: nullable(code), label })),
    allergies: value.allergies,
    allergy_status: value.allergy_status,
  }
}

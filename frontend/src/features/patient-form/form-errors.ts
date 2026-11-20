import type { PatientFormValues } from './schema'

const fieldLabels: Record<keyof PatientFormValues, string> = {
  first_name: 'First name',
  middle_initial: 'Middle initial',
  last_name: 'Last name',
  date_of_birth: 'Date of birth',
  phone: 'Phone',
  email: 'Email',
  address_line1: 'Address line 1',
  address_line2: 'Address line 2',
  city: 'City',
  state: 'State / region',
  postal_code: 'Postal code',
  blood_type: 'Blood type',
  status: 'Patient status',
  last_visit: 'Last visit',
  conditions: 'Conditions',
  allergies: 'Reported allergy list',
  allergy_status: 'Allergy status',
}

export function patientFieldLabel(path: string): string {
  const condition = /^conditions\[(\d+)\]\.(code|label)$/.exec(path)
  if (condition) return `Condition ${Number(condition[1]) + 1} ${condition[2]}`
  const allergy = /^allergies\[(\d+)\]$/.exec(path)
  if (allergy) return `Allergy ${Number(allergy[1]) + 1}`
  return fieldLabels[path as keyof PatientFormValues] ?? 'Patient information'
}

export function fieldDescription(id: string, description?: string, error?: string) {
  return (
    [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined
  )
}

export function isPatientField(path: string, values: PatientFormValues): boolean {
  if (Object.hasOwn(values, path)) return true
  const condition = /^conditions\[(\d+)\]\.(code|label)$/.exec(path)
  if (condition) return Number(condition[1]) < values.conditions.length
  const allergy = /^allergies\[(\d+)\]$/.exec(path)
  return !!allergy && Number(allergy[1]) < values.allergies.length
}

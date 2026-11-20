export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toUpperCase()
}

export function getPatientName(patient: {
  first_name: string
  middle_initial?: string | null
  last_name: string
}): string {
  return [patient.first_name, patient.middle_initial, patient.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

export function formatRecordNumber(patient: {
  mrn?: string | null
  source_patient_id?: string | null
  id: string
}): string {
  return patient.source_patient_id || patient.mrn || patient.id
}

import type { Page, PatientListItem } from '@/api/types'

export function makePatient(id: string, overrides: Partial<PatientListItem> = {}): PatientListItem {
  return {
    id,
    assigned_user_id: null,
    source_patient_id: null,
    mrn: null,
    first_name: 'Patient',
    middle_initial: null,
    last_name: id,
    name: `Patient ${id}`,
    date_of_birth: '1980-01-01',
    age: 46,
    last_visit: null,
    status: 'active',
    conditions: [],
    notes_count: 0,
    comments_count: 0,
    unread_comments_count: 0,
    ...overrides,
  }
}

export function makePage(
  items: PatientListItem[],
  overrides: Partial<Page<PatientListItem>> = {},
): Page<PatientListItem> {
  return { items, total: items.length, page: 1, page_size: 100, ...overrides }
}

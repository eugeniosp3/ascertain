import type { Comment, CommentPage, Note, PatientDetail } from '@/api'

export const actorId = '40000000-0000-4000-8000-000000000001'
export const otherActor = '40000000-0000-4000-8000-000000000002'
export const patientId = '10000000-0000-4000-8000-000000000001'
export const stamp = '2026-11-01T14:30:00.000Z'
export const patient: PatientDetail = {
  id: patientId,
  source_patient_id: 'PT-0123',
  mrn: '000123',
  first_name: 'Ada',
  middle_initial: 'J',
  last_name: 'Rivera',
  name: 'Ada J Rivera',
  date_of_birth: '1980-01-05',
  age: 46,
  status: 'active',
  last_visit: null,
  conditions: [{ code: 'I10', label: 'Hypertension' }],
  notes_count: 1,
  comments_count: 2,
  unread_comments_count: 1,
  assigned_user_id: actorId,
  phone: null,
  email: null,
  address_line1: '123 Main Street',
  address_line2: 'Unit 2',
  city: 'Albany',
  state: 'NY',
  postal_code: '01234',
  blood_type: null,
  allergies: [],
  allergy_status: 'unknown',
  created_at: stamp,
  updated_at: stamp,
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    patient_id: patientId,
    content: 'Follow-up visit\nClinical detail',
    timestamp: stamp,
    author: { id: actorId, display_name: 'Sam Rivera' },
    created_at: stamp,
    updated_at: stamp,
    attachments: [],
    ...overrides,
  }
}

export function makeComment(id = 'comment-1', overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    patient_id: patientId,
    body: `Comment ${id}`,
    author: { id: otherActor, display_name: 'Alex Morgan' },
    created_at: stamp,
    updated_at: stamp,
    is_unread: true,
    note_links: [],
    ...overrides,
  }
}

export function makeCommentPage(
  items: Comment[] = [],
  overrides: Partial<CommentPage> = {},
): CommentPage {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 10,
    read_through: '2026-11-01T14:30:01.123456+00:00',
    next_cursor: null,
    ...overrides,
  }
}

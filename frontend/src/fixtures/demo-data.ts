import type { Note, PatientDetail, User } from '../api/types'

export type DemoPatient = Omit<
  PatientDetail,
  'name' | 'age' | 'notes_count' | 'comments_count' | 'unread_comments_count'
>

export interface DemoNote extends Note {
  deleted: boolean
}

export interface DemoComment {
  id: string
  patient_id: string
  body: string
  author: User
  created_at: string
  updated_at: string
  note_ids: string[]
}

export function demoId(kind: 'patient' | 'note' | 'comment' | 'user', sequence: number): string {
  const prefix = { patient: '10000000', note: '20000000', comment: '30000000', user: '40000000' }
  return `${prefix[kind]}-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

export const demoUsers: readonly User[] = [
  { id: demoId('user', 1), display_name: 'Demo User 1 · Sam Rivera' },
  { id: demoId('user', 2), display_name: 'Demo User 2 · Alex Morgan' },
]

const firstNames = [
  'Ana',
  'Marcus',
  'Priya',
  'Daniel',
  'Mei',
  'Olivia',
  'Tomás',
  'Aisha',
  'Noah',
  'Grace',
]
const lastNames = [
  'Silva',
  'Okafor',
  'Nguyen',
  'Patel',
  'Kim',
  'Bennett',
  'García',
  'Haddad',
  'Rossi',
  'Thompson',
]
const conditions = [
  { code: 'I10', label: 'Essential hypertension' },
  { code: 'E11.9', label: 'Type 2 diabetes mellitus' },
  { code: 'J45.909', label: 'Asthma' },
  { code: null, label: 'Seasonal allergies' },
]

/**
 * Synthetic workload: the roster index (0 = first demo user, 1 = second) of PT-0001…PT-0100, one
 * character per patient. Same rule as the backend `demo-assignments-v1` seed: SHA-256 of the exact
 * `source_patient_id` UTF-8 bytes, first eight bytes as an unsigned big-endian integer, modulo two
 * (`digest[7] & 1`). Precomputed because fixtures are built synchronously; demo-data.test.ts
 * recomputes every entry. Assignment never changes clinical, status or visit values.
 */
const demoAssignmentRoster =
  '0101000011111110110101011010111000010100010011000001001111001011000110000111010010010110110001100110'

/** Fictional application fixtures only: no source CSV, imported notes, or clinical files. */
export function createDemoData() {
  const users = demoUsers.map((user) => ({ ...user }))
  const firstUser = users[0]!
  const secondUser = users[1]!
  const patients: DemoPatient[] = []
  const notes: DemoNote[] = []
  const comments: DemoComment[] = []
  const lastReadByActor = new Map<string, Map<string, string>>(
    users.map((user) => [user.id, new Map<string, string>()]),
  )

  for (let index = 0; index < 100; index++) {
    const n = index + 1
    const id = demoId('patient', n)
    const date = `2026-${String(1 + (index % 10)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}`
    const first_name = firstNames[index % firstNames.length]!
    const last_name = lastNames[Math.floor(index / 10)]!
    const allergy_status = index % 3 === 0 ? 'unknown' : index % 3 === 1 ? 'no_known' : 'reported'
    patients.push({
      id,
      assigned_user_id: users[Number(demoAssignmentRoster[index])]!.id,
      source_patient_id: `PT-${String(n).padStart(4, '0')}`,
      mrn: String(1000000 + n).padStart(8, '0'),
      first_name,
      middle_initial: index % 4 === 0 ? 'J' : null,
      last_name,
      date_of_birth: `${1940 + (index % 65)}-${String(1 + (index % 12)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}`,
      last_visit: index % 11 === 0 ? null : date,
      status: index % 4 === 0 ? 'inactive' : 'active',
      conditions: index % 7 === 0 ? [] : [{ ...conditions[index % conditions.length]! }],
      phone: `+1 (212) 555-01${String(index).padStart(2, '0')}`,
      email: `${first_name.toLowerCase()}.${n}@example.com`,
      address_line1: `${100 + n} Fictional Cedar Lane`,
      address_line2: index % 5 === 0 ? `Unit ${n}` : null,
      city: 'Albany',
      state: 'NY',
      postal_code: '01234',
      blood_type: index % 3 === 0 ? null : index % 2 === 0 ? 'O+' : 'A+',
      allergies: allergy_status === 'reported' ? ['Penicillin (rash)'] : [],
      allergy_status,
      created_at: '2020-01-15T14:00:00.000Z',
      updated_at: `${date}T15:00:00.000Z`,
      profile_details: {
        care_team: {
          pcp_name:
            index % 2 === 0 ? 'Dr. Taylor Example (synthetic)' : 'Dr. Morgan Demo (synthetic)',
          pcp_npi: '0000000000',
          home_facility_key: 'DEMO',
          first_registered_date: '2020-01-15',
        },
      },
    })

    const noteCount = n === 1 ? 4 : index % 5
    for (let j = 0; j < noteCount; j++) {
      const timestamp = `2026-10-${String(1 + j).padStart(2, '0')}T14:30:00.000Z`
      notes.push({
        id: demoId('note', n * 10 + j),
        patient_id: id,
        timestamp,
        content:
          j === 0
            ? 'Synthetic intake: contact details and recorded history reviewed.'
            : `Synthetic follow-up ${j}: the patient reported no new concerns. Routine visit recorded.`,
        author: j % 2 === 0 ? firstUser : secondUser,
        created_at: timestamp,
        updated_at: timestamp,
        attachments: [],
        deleted: false,
      })
    }

    const commentCount = n <= 12 || n % 11 === 0 ? 3 : index % 4
    for (let j = 0; j < commentCount; j++) {
      const commentId = demoId('comment', n * 10 + j)
      const author = j === 2 ? secondUser : firstUser
      const timestamp = `2026-11-${String(1 + j).padStart(2, '0')}T16:00:00.000Z`
      comments.push({
        id: commentId,
        patient_id: id,
        body:
          j === 2
            ? 'Synthetic team discussion: please confirm the next appointment time.'
            : 'Synthetic coordination message. Contact information checked with the front desk.',
        author,
        created_at: timestamp,
        updated_at: j === 1 ? '2026-11-02T17:00:00.000Z' : timestamp,
        note_ids: noteCount && j === 2 ? [demoId('note', n * 10)] : [],
      })
    }
    // Seed chronological prefixes, excluding own comments from unread activity.
    lastReadByActor
      .get(firstUser.id)!
      .set(id, n <= 12 ? '2026-11-02T16:00:00.000Z' : '2026-11-03T16:00:00.000Z')
    lastReadByActor
      .get(secondUser.id)!
      .set(id, n % 11 === 0 ? '2026-11-01T16:00:00.000Z' : '2026-11-03T16:00:00.000Z')
  }
  return { users, patients, notes, comments, lastReadByActor }
}

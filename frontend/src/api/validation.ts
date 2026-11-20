import { formatDate, timestampMicros } from '../utils/dates'
import { ApiError } from './client'
import {
  COMMENT_BODY_MAX,
  isValidPhone,
  MAX_COMMENT_NOTE_IDS,
  NOTE_CONTENT_MAX,
  PATIENT_FIELD_LIMITS as limits,
} from './constraints'
import type {
  CommentPageParams,
  CommentWrite,
  DiscussionReadInput,
  NoteWrite,
  PatientListParams,
  PatientWrite,
} from './types'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function invalid(fields: Record<string, string>): never {
  throw new ApiError(422, 'validation_error', 'Request validation failed.', fields)
}

export function validateId(id: unknown, field = 'id'): asserts id is string {
  if (typeof id !== 'string' || !uuidPattern.test(id)) invalid({ [field]: 'Expected a UUID.' })
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid({ body: 'Expected an object.' })
  }
  return value as Record<string, unknown>
}

function allowedKeys(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) invalid({ [key]: 'Unexpected field.' })
  }
}

function text(value: unknown, field: string, max: number, nullable = false): string | null {
  if (value === null && nullable) return null
  if (typeof value !== 'string') invalid({ [field]: 'Expected text.' })
  const trimmed = value.trim()
  if (!trimmed) {
    invalid({ [field]: 'Text must not be blank.' })
  }
  if ([...trimmed].length > max) invalid({ [field]: `Use at most ${max} characters.` })
  return trimmed
}

function date(value: unknown, field: string, nullable = false): string | null {
  if (value === null && nullable) return null
  if (typeof value !== 'string') invalid({ [field]: 'Expected YYYY-MM-DD.' })
  try {
    formatDate(value)
  } catch {
    invalid({ [field]: 'Enter a valid date.' })
  }
  if (value > new Date().toISOString().slice(0, 10))
    invalid({ [field]: 'Date cannot be in the future.' })
  return value
}

function choice<T extends string>(value: unknown, field: string, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    invalid({ [field]: 'Value is not one of the allowed choices.' })
  }
  return value as T
}

export function validatePatient(input: PatientWrite): PatientWrite {
  const value = record(input)
  const keys = [
    'first_name',
    'middle_initial',
    'last_name',
    'date_of_birth',
    'phone',
    'email',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'blood_type',
    'status',
    'last_visit',
    'conditions',
    'allergies',
    'allergy_status',
  ]
  allowedKeys(value, keys)
  for (const key of keys) {
    if (!Object.hasOwn(value, key) || value[key] === undefined)
      invalid({ [key]: 'Field is required.' })
  }
  const middle_initial = text(value.middle_initial, 'middle_initial', 1, true)
  const email = text(value.email, 'email', 254, true)
  if (email !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    invalid({ email: 'Enter a valid email address.' })
  }
  const phone = text(value.phone, 'phone', 40, true)
  if (phone !== null && !isValidPhone(phone)) {
    invalid({ phone: 'Enter a valid phone number.' })
  }
  const blood_type =
    value.blood_type === null
      ? null
      : choice(value.blood_type, 'blood_type', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  if (!Array.isArray(value.conditions) || value.conditions.length > 100) {
    invalid({ conditions: 'Use an array of at most 100 conditions.' })
  }
  const conditions = value.conditions.map((item: unknown, index: number) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      invalid({ [`conditions[${index}]`]: 'Expected a condition object.' })
    }
    const condition = item as Record<string, unknown>
    for (const key of Object.keys(condition)) {
      if (key !== 'code' && key !== 'label')
        invalid({ [`conditions[${index}].${key}`]: 'Unexpected field.' })
    }
    return {
      code: text(condition.code ?? null, `conditions[${index}].code`, limits.condition_code, true),
      label: text(condition.label, `conditions[${index}].label`, limits.condition_label)!,
    }
  })
  if (!Array.isArray(value.allergies) || value.allergies.length > 100) {
    invalid({ allergies: 'Use an array of at most 100 allergies.' })
  }
  const allergies = value.allergies.map((item: unknown, index: number) =>
    text(item, `allergies[${index}]`, limits.allergy)!,
  )
  const allergy_status = choice(value.allergy_status, 'allergy_status', [
    'unknown',
    'no_known',
    'reported',
  ])
  if ((allergy_status === 'reported') !== allergies.length > 0) {
    invalid({
      allergies:
        'Reported allergies require a nonempty list; other statuses require an empty list.',
    })
  }
  const state = text(value.state, 'state', limits.state, true)
  if (state !== null && [...state].length !== 2)
    invalid({ state: 'Use exactly two characters or null.' })
  return {
    first_name: text(value.first_name, 'first_name', limits.name)!,
    middle_initial,
    last_name: text(value.last_name, 'last_name', limits.name)!,
    date_of_birth: date(value.date_of_birth, 'date_of_birth')!,
    phone,
    email,
    address_line1: text(value.address_line1, 'address_line1', limits.address, true),
    address_line2: text(value.address_line2, 'address_line2', limits.address, true),
    city: text(value.city, 'city', 100, true),
    state,
    postal_code: text(value.postal_code, 'postal_code', limits.postal_code, true),
    blood_type,
    status: choice(value.status, 'status', ['active', 'inactive']),
    last_visit: date(value.last_visit, 'last_visit', true),
    conditions,
    allergies,
    allergy_status,
  }
}

export function validateNote(input: NoteWrite): NoteWrite {
  const value = record(input)
  allowedKeys(value, ['timestamp', 'content'])
  const timestamp = validateTimestamp(value.timestamp, 'timestamp')
  if (timestampMicros(timestamp) > BigInt(Date.now()) * 1000n)
    invalid({ timestamp: 'Clinical time cannot be in the future.' })
  return {
    timestamp: new Date(timestamp).toISOString(),
    content: text(value.content, 'content', NOTE_CONTENT_MAX)!,
  }
}

function validateTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid({ [field]: 'Expected a timestamp with a timezone.' })
  try {
    timestampMicros(value)
  } catch {
    invalid({ [field]: 'Enter a valid timestamp with a timezone.' })
  }
  return value
}

export function validateDiscussionRead(input: DiscussionReadInput): DiscussionReadInput {
  const value = record(input)
  allowedKeys(value, ['through'])
  return { through: validateTimestamp(value.through, 'through') }
}

export function validateIds(ids: unknown, field: string, max: number): string[] {
  if (!Array.isArray(ids) || ids.length > max)
    invalid({ [field]: `Use an array of at most ${max} IDs.` })
  ids.forEach((id, index) => validateId(id, `${field}[${index}]`))
  if (new Set(ids).size !== ids.length) invalid({ [field]: 'Note references must be distinct.' })
  return ids as string[]
}

export function validateComment(input: CommentWrite): CommentWrite {
  const value = record(input)
  allowedKeys(value, ['body', 'note_ids'])
  return {
    body: text(value.body, 'body', COMMENT_BODY_MAX)!,
    note_ids: validateIds(
      value.note_ids === undefined ? [] : value.note_ids,
      'note_ids',
      MAX_COMMENT_NOTE_IDS,
    ),
  }
}

export function validatePage(params: CommentPageParams): { page: number; page_size: number } {
  const page = params.page === undefined ? 1 : params.page
  const page_size = params.page_size === undefined ? 20 : params.page_size
  if (!Number.isInteger(page) || page < 1 || !Number.isSafeInteger(page))
    invalid({ 'query.page': 'Use an integer of at least 1.' })
  if (!Number.isInteger(page_size) || page_size < 1 || page_size > 100)
    invalid({ 'query.page_size': 'Use an integer between 1 and 100.' })
  return { page, page_size }
}

export function validateList(params: PatientListParams) {
  const paging = validatePage(params)
  const q = params.q === undefined ? '' : (text(params.q, 'query.q', 200, true) ?? '')
  const status =
    params.status === undefined
      ? undefined
      : choice(params.status, 'query.status', ['active', 'inactive'])
  const assigned_to =
    params.assigned_to === undefined
      ? undefined
      : choice(params.assigned_to, 'query.assigned_to', ['me'])
  const sort_by =
    params.sort_by === undefined
      ? 'name'
      : choice(params.sort_by, 'query.sort_by', [
          'name',
          'dob',
          'last_visit',
          'status',
          'notes_count',
          'comments_count',
        ])
  const order =
    params.order === undefined ? 'asc' : choice(params.order, 'query.order', ['asc', 'desc'])
  if (params.has_unread_comments !== undefined && typeof params.has_unread_comments !== 'boolean') {
    invalid({ 'query.has_unread_comments': 'Expected a boolean.' })
  }
  return {
    ...paging,
    q,
    status,
    assigned_to,
    sort_by,
    order,
    has_unread_comments: params.has_unread_comments,
  }
}

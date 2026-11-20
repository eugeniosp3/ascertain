import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'

export interface Actor {
  id: string
  display_name: string
  display_role: string | null
}

export interface PatientWrite {
  first_name: string
  middle_initial: string | null
  last_name: string
  date_of_birth: string
  phone: string | null
  email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  blood_type: string | null
  status: 'active' | 'inactive'
  last_visit: string | null
  conditions: { code: string | null; label: string }[]
  allergies: string[]
  allergy_status: 'unknown' | 'no_known' | 'reported'
}

export interface PatientRow {
  id: string
  source_patient_id: string | null
  mrn: string | null
  name: string
  age: number
  notes_count: number
  comments_count: number
  unread_comments_count: number
}

export interface Patient extends PatientWrite, PatientRow {
  profile_details: unknown
  source_lineage: unknown
  source_created_at: string | null
  source_updated_at: string | null
}

export interface PatientPage {
  items: PatientRow[]
  total: number
  page: number
  page_size: number
}

export interface Note {
  id: string
  patient_id: string
  timestamp: string
  content: string
  author: Actor
}

export interface Comment {
  id: string
  patient_id: string
  body: string
  author: Actor
  created_at: string
  updated_at: string
  is_unread: boolean
  note_links: { id: string; label: string; is_deleted: boolean }[]
}

export interface CommentPage {
  items: Comment[]
  total: number
  page: number
  page_size: number
  read_through: string
  next_cursor: string | null
}

export interface NotificationSummary {
  unread_comments: number
  patients_with_unread: number
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Overrides = Partial<Omit<PatientWrite, 'first_name' | 'last_name'>>

// A process-local fallback lets afterAll retry only explicitly tracked creates if teardown failed.
export const outstandingPatients = new Map<string, string>()

export async function expectStatus(response: APIResponse, status: number) {
  let code = ''
  if (response.status() !== status) {
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === 'object' && 'error' in body) {
      const error = body.error
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string')
        code = ` (${error.code})`
    }
  }
  // Never print a patient/response body or request credentials in diagnostic messages.
  expect(response.status(), `Live API expected HTTP ${status}${code}`).toBe(status)
}

export function expectPatientFields(
  actual: PatientWrite,
  expected: PatientWrite,
  exactKeys = false,
) {
  if (exactKeys) expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
  for (const key of Object.keys(expected) as (keyof PatientWrite)[]) {
    expect(
      JSON.stringify(actual[key]) === JSON.stringify(expected[key]),
      `Writable patient field: ${key}`,
    ).toBe(true)
  }
}

/** Same-origin HTTP plus explicitly owned disposable records; no database or application internals. */
export class LiveApi {
  readonly token = randomUUID().replaceAll('-', '').slice(0, 14)
  readonly owned = new Set<string>()
  private readonly names = new Set<string>()
  private sequence = 0
  readonly apiBase: string

  constructor(
    readonly request: APIRequestContext,
    readonly baseURL: string,
    readonly cleanupActor: string,
  ) {
    this.apiBase = `${baseURL.replace(/\/$/, '')}/api`
  }

  uiURL(path: string) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected a UI path.')
    return `${this.baseURL.replace(/\/$/, '')}${path}`
  }

  apiURL(path: string) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected an API path.')
    const result = new URL(`${this.apiBase}${path}`)
    if (result.origin !== new URL(this.baseURL).origin) throw new Error('Cross-origin API blocked.')
    return result.href
  }

  patientInput(label: string, overrides: Overrides = {}): PatientWrite {
    const last_name = `${label}-${this.token}-${++this.sequence}`
    this.names.add(last_name)
    return {
      first_name: 'Integration',
      middle_initial: null,
      last_name,
      date_of_birth: '1987-05-09',
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
      ...overrides,
    }
  }

  trackCreated(patient: Patient) {
    if (patient.first_name !== 'Integration' || !this.names.has(patient.last_name)) {
      throw new Error('Refusing to track a patient not named by this test.')
    }
    if (!/^[0-9a-f-]{36}$/i.test(patient.id)) throw new Error('Create returned no patient UUID.')
    this.owned.add(patient.id)
    outstandingPatients.set(patient.id, this.cleanupActor)
  }

  async response(method: Method, path: string, actorId?: string, data?: unknown) {
    if (method !== 'GET') {
      const match = /^\/patients\/([0-9a-f-]{36})(?:\/|$)/i.exec(path)
      if (path === '/patients' && method === 'POST') {
        const input = data as Partial<PatientWrite> | undefined
        if (input?.first_name !== 'Integration' || !this.names.has(input.last_name ?? ''))
          throw new Error('Refusing to create an unregistered test patient.')
      } else if (!match?.[1] || !this.owned.has(match[1])) {
        throw new Error('Refusing to mutate a patient not created by this test.')
      }
    }
    const response = await this.request.fetch(this.apiURL(path), {
      method,
      headers: actorId ? { 'X-Demo-User-ID': actorId } : {},
      ...(data === undefined ? {} : { data }),
      timeout: 15_000,
      maxRedirects: 0,
    })
    // Even a negative create that unexpectedly succeeds must be owned and cleaned.
    if (method === 'POST' && path === '/patients' && response.status() === 201)
      this.trackCreated((await response.json()) as Patient)
    return response
  }

  async json<T>(method: Method, path: string, actorId?: string, data?: unknown, status = 200) {
    const response = await this.response(method, path, actorId, data)
    await expectStatus(response, status)
    const value: unknown = response.status() === 204 ? undefined : await response.json()
    return value as T
  }

  createPatient(label: string, actorId: string, overrides: Overrides = {}) {
    return this.json<Patient>(
      'POST',
      '/patients',
      actorId,
      this.patientInput(label, overrides),
      201,
    )
  }

  patient(id: string, actorId: string) {
    return this.json<Patient>('GET', `/patients/${id}`, actorId)
  }

  comments(id: string, actorId: string, pageSize = 100) {
    return this.json<CommentPage>('GET', `/patients/${id}/comments?page_size=${pageSize}`, actorId)
  }

  createComment(id: string, actorId: string, body: string, note_ids: string[] = []) {
    return this.json<Comment>('POST', `/patients/${id}/comments`, actorId, { body, note_ids }, 201)
  }

  notifications(actorId: string) {
    return this.json<NotificationSummary>('GET', '/notifications/summary', actorId)
  }

  async cleanup() {
    const failures: string[] = []
    for (const id of this.owned) {
      try {
        const removed = await this.response('DELETE', `/patients/${id}`, this.cleanupActor)
        expect([204, 404], `Cleanup patient ${id}: unexpected delete status`).toContain(
          removed.status(),
        )
        const absent = await this.response('GET', `/patients/${id}`, this.cleanupActor)
        await expectStatus(absent, 404)
        outstandingPatients.delete(id)
      } catch {
        failures.push(id)
      }
    }
    expect(
      failures,
      'Cleanup failed for these test-created UUIDs; afterAll will retry them',
    ).toEqual([])
  }
}

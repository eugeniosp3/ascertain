import { expect, test as base, type Page, type Route } from '@playwright/test'
import type {
  Comment,
  CommentWrite,
  Note,
  NoteWrite,
  PatientDetail,
  PatientWrite,
} from '../src/api/types'

export const actor = { id: 'a0000000-0000-4000-8000-000000000001', display_name: 'API Avery' }
export const colleague = {
  id: 'a0000000-0000-4000-8000-000000000002',
  display_name: 'API Blake',
}
export const patientId = 'b0000000-0000-4000-8000-000000000001'
export const patientPath = `/patients/${patientId}`
export const noteId = 'c0000000-0000-4000-8000-000000000001'
export const notePath = `${patientPath}/notes/${noteId}`
const instant = '2026-11-01T15:00:00.000Z'

export const emptyWrite: PatientWrite = {
  first_name: 'HTTP',
  middle_initial: null,
  last_name: 'Patient',
  date_of_birth: '1980-05-09',
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
}

export function detail(overrides: Partial<PatientDetail> = {}): PatientDetail {
  return {
    ...emptyWrite,
    id: patientId,
    name: 'HTTP Patient',
    source_patient_id: 'HTTP-0001',
    mrn: '00004123',
    age: 46,
    notes_count: 1,
    comments_count: 12,
    unread_comments_count: 11,
    created_at: instant,
    updated_at: instant,
    profile_details: {
      care_team: {
        pcp_name: 'HTTP source clinician',
        pcp_npi: '0000000001',
        home_facility_key: 'HTTP',
        first_registered_date: '2020-01-01',
      },
    },
    source_created_at: '2020-01-01T00:00:00Z',
    source_updated_at: '2020-01-02T00:00:00Z',
    ...overrides,
  }
}

export interface ApiRequest {
  method: string
  path: string
  query: Record<string, string>
  actorId: string | undefined
  body: unknown
}
export interface Reply {
  status?: number
  json?: unknown
  abort?: boolean
}
export function failure(status: number, message: string): Reply {
  return { status, json: { error: { code: `http_${status}`, message, fields: [] } } }
}
type Handler = (request: ApiRequest) => Reply | undefined | Promise<Reply | undefined>

/** Contract fixtures, not an implementation of the current backend dialect.
 * Every test gets a fresh HTTP store and Playwright browser context. All API
 * traffic passes through the real browser fetch adapter, never injected state.
 */
export class ContractApi {
  requests: ApiRequest[] = []
  violations: string[] = []
  selectedActor: string | undefined
  patient = detail()
  deleted = false
  notifications = { unread_comments_count: 37, patients_with_unread_comments: 8 }
  notes: Note[] = [
    {
      id: noteId,
      patient_id: patientId,
      timestamp: instant,
      content: 'HTTP clinical note\nLiteral <b>response</b>',
      author: actor,
      created_at: instant,
      updated_at: instant,
      attachments: [],
    },
  ]
  comments: Comment[] = Array.from({ length: 12 }, (_, index) => ({
    id: `d0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    patient_id: patientId,
    body: `HTTP comment ${index + 1}`,
    author: index === 0 ? actor : colleague,
    created_at: `2026-11-${String(15 - index).padStart(2, '0')}T15:00:00Z`,
    updated_at: `2026-11-${String(15 - index).padStart(2, '0')}T15:00:00Z`,
    is_unread: index !== 0,
    note_links: [],
  }))
  handler: Handler = () => undefined

  matching(method: string, path: string) {
    return this.requests.filter((request) => request.method === method && request.path === path)
  }

  async install(page: Page, origin: string) {
    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin !== origin) {
        this.violations.push(`Unexpected external request: ${request.method()} ${url}`)
        await route.abort('blockedbyclient')
        return
      }
      if (!url.pathname.startsWith('/api/')) {
        if (['fetch', 'xhr'].includes(request.resourceType())) {
          this.violations.push(`Unexpected non-API fetch: ${request.method()} ${url}`)
          await route.abort('blockedbyclient')
        } else await route.continue()
        return
      }
      try {
        const call: ApiRequest = {
          method: request.method(),
          path: url.pathname.slice(4),
          query: Object.fromEntries(url.searchParams),
          actorId: request.headers()['x-demo-user-id'],
          body: request.postData() === null ? undefined : request.postDataJSON(),
        }
        this.requests.push(call)
        expect(request.headers().accept).toBe('application/json')
        expect([...url.searchParams.keys()].length).toBe(Object.keys(call.query).length)
        if (call.path === '/users') {
          expect([undefined, this.selectedActor]).toContain(call.actorId)
        } else {
          expect(this.selectedActor, 'Domain requests must follow explicit user selection').toBe(
            actor.id,
          )
          expect(call.actorId).toBe(actor.id)
        }
        if (call.body !== undefined) {
          expect(request.headers()['content-type']).toBe('application/json')
        }
        this.validate(call)
        const reply = (await this.handler(call)) ?? this.respond(call)
        await this.fulfill(route, reply)
      } catch (error) {
        this.violations.push(String(error))
        await this.fulfill(route, failure(500, 'Rejected unexpected contract request'))
      }
    })
  }

  private validate(call: ApiRequest) {
    const { method, path, query, body } = call
    const patient = path === patientPath
    const collection = path === '/patients'
    const notes = path === `${patientPath}/notes`
    const comments = path === `${patientPath}/comments`
    const comment = this.comments.some((item) => path === `${patientPath}/comments/${item.id}`)
    const read = path === `${patientPath}/comments/read`
    const note = path === notePath
    const known =
      (method === 'GET' &&
        (collection ||
          patient ||
          notes ||
          note ||
          comments ||
          path === '/users' ||
          path === '/notifications/summary' ||
          path === `${patientPath}/summary`)) ||
      (method === 'POST' && (collection || notes || comments || read)) ||
      (method === 'PUT' && (patient || comment)) ||
      (method === 'DELETE' && (patient || note || comment))
    expect(known, `Unexpected method/path: ${method} ${path}`).toBe(true)
    if (method === 'GET' && collection) {
      const allowed = [
        'q',
        'status',
        'sort_by',
        'order',
        'page',
        'page_size',
        'has_unread_comments',
      ]
      expect(Object.keys(query).every((key) => allowed.includes(key))).toBe(true)
      for (const key of ['page', 'page_size']) {
        if (query[key] !== undefined) expect(query[key]).toMatch(/^[1-9]\d*$/)
      }
      if (query.page_size !== undefined) expect(Number(query.page_size)).toBeLessThanOrEqual(100)
      if (query.q !== undefined) expect(query.q.length).toBeLessThanOrEqual(200)
      if (query.status !== undefined) expect(['active', 'inactive']).toContain(query.status)
      if (query.order !== undefined) expect(['asc', 'desc']).toContain(query.order)
      if (query.sort_by !== undefined)
        expect(['name', 'dob', 'last_visit', 'status', 'notes_count', 'comments_count']).toContain(
          query.sort_by,
        )
      if (query.has_unread_comments !== undefined)
        expect(['true', 'false']).toContain(query.has_unread_comments)
    } else if (method === 'GET' && comments) {
      expect(Object.keys(query).sort()).toEqual(['page', 'page_size'])
      expect(query.page).toMatch(/^[1-9]\d*$/)
      expect(['10', '20']).toContain(query.page_size)
    } else expect(query).toEqual({})

    if (method === 'GET' || method === 'DELETE') expect(body).toBeUndefined()
    else if (collection || patient) {
      expect(Object.keys(body as object).sort()).toEqual(Object.keys(emptyWrite).sort())
      expect(body).toMatchObject({ conditions: expect.any(Array), allergies: expect.any(Array) })
    } else if (notes) {
      expect(Object.keys(body as object).sort()).toEqual(['content', 'timestamp'])
      expect((body as NoteWrite).timestamp).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    } else if (comments || comment) {
      expect(Object.keys(body as object).sort()).toEqual(['body', 'note_ids'])
      expect(
        (body as CommentWrite).note_ids.every((id) => this.notes.some((n) => n.id === id)),
      ).toBe(true)
    } else if (read) {
      expect(Object.keys(body as object)).toEqual(['comment_ids'])
      expect((body as { comment_ids: string[] }).comment_ids.length).toBeLessThanOrEqual(100)
    }
  }

  private respond({ method, path, query, body }: ApiRequest): Reply {
    if (path === '/users') return { json: [actor, colleague] }
    if (path === '/notifications/summary') return { json: this.notifications }
    if (method === 'GET' && path === '/patients') {
      const included =
        !this.deleted &&
        (!query.status || query.status === this.patient.status) &&
        (!query.q ||
          `${this.patient.name} ${this.patient.source_patient_id} ${this.patient.mrn}`
            .toLowerCase()
            .includes(query.q.toLowerCase())) &&
        (!query.has_unread_comments || this.patient.unread_comments_count > 0)
      return {
        json: {
          items: included ? [this.patient] : [],
          total: included ? 1 : 0,
          page: Number(query.page ?? 1),
          page_size: Number(query.page_size ?? 20),
        },
      }
    }
    if (method === 'POST' && path === '/patients') {
      this.patient = detail({ ...(body as PatientWrite), name: 'HTTP Created' })
      return { status: 201, json: this.patient }
    }
    if (path === patientPath) {
      if (this.deleted) return failure(404, 'Patient not found.')
      if (method === 'PUT') {
        const values = body as PatientWrite
        this.patient = {
          ...this.patient,
          ...values,
          name: `${values.first_name} ${values.last_name}`,
        }
      }
      if (method === 'DELETE') {
        this.deleted = true
        return { status: 204 }
      }
      return { json: this.patient }
    }
    if (path === `${patientPath}/summary`)
      return {
        json: {
          patient_id: patientId,
          summary: 'HTTP summary narrative.',
          generated_at: instant,
          method: 'template',
        },
      }
    if (path === `${patientPath}/notes`) {
      if (method === 'POST') {
        this.notes = [{ ...this.notes[0]!, ...(body as NoteWrite), id: noteId, author: actor }]
        this.patient.notes_count = 1
        return { status: 201, json: this.notes[0] }
      }
      return { json: this.notes }
    }
    if (path === notePath) {
      if (method === 'DELETE') {
        this.notes = []
        this.patient.notes_count = 0
        this.comments = this.comments.map((comment) => ({
          ...comment,
          note_links: comment.note_links.map((link) => ({
            ...link,
            is_deleted: true,
            label: 'Deleted note',
          })),
        }))
        return { status: 204 }
      }
      return this.notes.length ? { json: this.notes[0] } : failure(410, 'This note was deleted.')
    }
    if (path === `${patientPath}/comments/read`) {
      const ids = (body as { comment_ids: string[] }).comment_ids
      this.comments = this.comments.map((comment) =>
        ids.includes(comment.id) ? { ...comment, is_unread: false } : comment,
      )
      this.patient.unread_comments_count = this.comments.filter((c) => c.is_unread).length
      return {
        json: {
          patient_id: patientId,
          read_comment_ids: ids,
          unread_comments_count: this.patient.unread_comments_count,
        },
      }
    }
    if (path === `${patientPath}/comments`) {
      if (method === 'POST') {
        const values = body as CommentWrite
        const comment: Comment = {
          ...this.comments[0]!,
          id: 'd0000000-0000-4000-8000-000000000099',
          body: values.body,
          author: actor,
          is_unread: false,
          note_links: values.note_ids.map((id) => ({
            id,
            label: 'HTTP clinical note',
            url: `${patientPath}/notes/${id}`,
            is_deleted: false,
          })),
        }
        this.comments.unshift(comment)
        this.patient.comments_count = this.comments.length
        return { status: 201, json: comment }
      }
      const page = Number(query.page)
      const size = Number(query.page_size)
      return {
        json: {
          items: this.comments.slice((page - 1) * size, page * size),
          total: this.comments.length,
          page,
          page_size: size,
        },
      }
    }
    throw new Error(`No fixture response: ${method} ${path}`)
  }

  private async fulfill(route: Route, reply: Reply) {
    if (reply.abort) await route.abort('failed')
    else if (reply.status === 204) await route.fulfill({ status: 204, body: '' })
    else await route.fulfill({ status: reply.status ?? 200, json: reply.json })
  }
}

export const test = base.extend<{ contract: ContractApi }>({
  contract: async ({ page, baseURL }, use) => {
    const api = new ContractApi()
    await api.install(page, new URL(baseURL!).origin)
    await use(api)
    expect(api.violations, 'All requests must satisfy the explicit HTTP contract').toEqual([])
  },
})
export { expect }

export async function selectActor(page: Page, contract: ContractApi) {
  // A direct record opens a modal immediately after selection and makes the
  // header inert; the chosen value remains present outside the modal.
  const selector = page.getByRole('combobox', { name: 'Select demo user', includeHidden: true })
  await expect(selector).toHaveText('Choose a user')
  await selector.click()
  contract.selectedActor = actor.id
  await page.getByRole('option', { name: actor.display_name, exact: true }).click()
  await expect(selector).toHaveText(actor.display_name)
}

export async function openPatient(page: Page, contract: ContractApi, path = patientPath) {
  await page.goto(path)
  await selectActor(page, contract)
  await expect(page.getByRole('dialog')).toBeVisible()
}

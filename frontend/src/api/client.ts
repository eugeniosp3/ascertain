import type { DashboardApi, Page, PatientListParams, PatientWrite, RequestContext } from './types'
import {
  notificationSummaryFromDto,
  patientDetailFromDto,
  patientListItemFromDto,
  type PatientDetailDto,
  type PatientListItemDto,
} from './dto'

export type ApiErrorKind =
  | 'network'
  | 'validation'
  | 'not_found'
  | 'gone'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'server'

function errorKind(status: number): ApiErrorKind {
  switch (status) {
    case 0:
      return 'network'
    case 400:
    case 422:
      return 'validation'
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
      return 'conflict'
    case 410:
      return 'gone'
    default:
      return 'server'
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string>
  readonly kind: ApiErrorKind

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.kind = errorKind(status)
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

function isAbortError(value: unknown): boolean {
  // DOMException and fetch can originate in a different window/realm.
  return (
    value !== null && typeof value === 'object' && 'name' in value && value.name === 'AbortError'
  )
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

// Field error mapping: turn API paths such as body/conditions/0/label into form field names.
function fieldPath(path: unknown[]): string {
  const parts = path[0] === 'body' ? path.slice(1) : path
  return parts.reduce<string>((key, part) => {
    if (typeof part === 'number') return `${key}[${part}]`
    return typeof part === 'string' ? `${key}${key ? '.' : ''}${part}` : key
  }, '')
}

// Safe HTTP errors: preserve useful validation details while hiding arbitrary server-error bodies.
function responseError(status: number, body: unknown): ApiError {
  if (status >= 500)
    return new ApiError(status, 'server_error', 'The service is unavailable. Try again.')
  const detail = object(object(body)?.error)
  const fields: Record<string, string> = {}
  if (Array.isArray(detail?.fields)) {
    for (const value of detail.fields) {
      const field = object(value)
      if (Array.isArray(field?.path) && typeof field.message === 'string') {
        const key = fieldPath(field.path)
        if (key && !Object.hasOwn(fields, key)) {
          Object.defineProperty(fields, key, { value: field.message, enumerable: true })
        }
      }
    }
  }
  return new ApiError(
    status,
    typeof detail?.code === 'string' ? detail.code : 'http_error',
    typeof detail?.message === 'string' ? detail.message : 'The request could not be completed.',
    fields,
  )
}

// Write boundary: whitelist editable fields so a detail object cannot leak author/source/computed data.
function patientBody(input: PatientWrite): PatientWrite {
  const {
    first_name,
    middle_initial,
    last_name,
    date_of_birth,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    blood_type,
    status,
    last_visit,
    conditions,
    allergies,
    allergy_status,
  } = input
  return {
    first_name,
    middle_initial,
    last_name,
    date_of_birth,
    phone,
    email,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    blood_type,
    status,
    last_visit,
    conditions: conditions.map(({ code, label }) => ({ code, label })),
    allergies,
    allergy_status,
  }
}

export function createHttpApi(
  baseUrl = '/api',
  fetcher: typeof fetch = globalThis.fetch,
): DashboardApi {
  const base = baseUrl.replace(/\/+$/, '')
  // HTTP boundary: all resources share URL construction, actor headers, JSON and error handling.
  async function request<T>(
    path: string,
    method: string,
    ctx?: RequestContext,
    body?: unknown,
  ): Promise<T> {
    // Cancellation: reject obsolete work and pass the query's AbortSignal through to fetch.
    ctx?.signal?.throwIfAborted()
    let response: Response
    try {
      response = await fetcher(`${base}${path}`, {
        method,
        signal: ctx?.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(ctx?.actorId === undefined ? {} : { 'X-Demo-User-ID': ctx.actorId }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (error) {
      ctx?.signal?.throwIfAborted()
      if (isAbortError(error)) throw error
      throw new ApiError(0, 'network_error', 'Unable to reach the service. Check your connection.')
    }
    if (response.status === 204 && response.ok) return undefined as T
    // Do not inspect or expose arbitrary 5xx bodies.
    if (response.status >= 500) throw responseError(response.status, undefined)
    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      ctx?.signal?.throwIfAborted()
      if (isAbortError(error)) throw error
      if (error instanceof TypeError) {
        throw new ApiError(0, 'network_error', 'The connection was interrupted. Try again.')
      }
      if (!response.ok) throw responseError(response.status, undefined)
      throw new ApiError(
        response.status,
        'invalid_response',
        'The service returned an invalid response.',
      )
    }
    ctx?.signal?.throwIfAborted()
    if (!response.ok) throw responseError(response.status, payload)
    // Response typing: this cast is a compile-time promise, not runtime JSON validation.
    return payload as T
  }

  const patientPath = (id: string) => `/patients/${encodeURIComponent(id)}`
  const notePath = (id: string, noteId: string) =>
    `${patientPath(id)}/notes/${encodeURIComponent(noteId)}`
  const commentPath = (id: string, commentId: string) =>
    `${patientPath(id)}/comments/${encodeURIComponent(commentId)}`

  return {
    listUsers: (ctx) => request('/users', 'GET', ctx),
    listPatients: async (params, ctx) => {
      const query = new URLSearchParams()
      const keys: Array<keyof PatientListParams> = [
        'q',
        'status',
        'sort_by',
        'order',
        'page',
        'page_size',
        'assigned_to',
      ]
      for (const key of keys) {
        if (params[key] !== undefined) query.set(key, String(params[key]))
      }
      if (params.has_unread_comments === true) query.set('unread_only', 'true')
      const page = await request<Page<PatientListItemDto>>(
        `/patients${query.size ? `?${query}` : ''}`,
        'GET',
        ctx,
      )
      return { ...page, items: page.items.map(patientListItemFromDto) }
    },
    getPatient: async (id, ctx) =>
      patientDetailFromDto(await request<PatientDetailDto>(patientPath(id), 'GET', ctx)),
    createPatient: async (input, ctx) =>
      patientDetailFromDto(
        await request<PatientDetailDto>('/patients', 'POST', ctx, patientBody(input)),
      ),
    updatePatient: async (id, input, ctx) =>
      patientDetailFromDto(
        await request<PatientDetailDto>(patientPath(id), 'PUT', ctx, patientBody(input)),
      ),
    deletePatient: (id, ctx) => request(patientPath(id), 'DELETE', ctx),
    listNotes: (id, ctx) => request(`${patientPath(id)}/notes`, 'GET', ctx),
    getNote: (id, noteId, ctx) => request(notePath(id, noteId), 'GET', ctx),
    createNote: (id, input, ctx) =>
      request(`${patientPath(id)}/notes`, 'POST', ctx, {
        timestamp: input.timestamp,
        content: input.content,
      }),
    deleteNote: (id, noteId, ctx) => request(notePath(id, noteId), 'DELETE', ctx),
    getSummary: (id, ctx) => request(`${patientPath(id)}/summary`, 'GET', ctx),
    listComments: (id, params, ctx) => {
      const query = new URLSearchParams()
      if (params.cursor !== undefined) query.set('cursor', params.cursor)
      else if (params.page !== undefined) query.set('page', String(params.page))
      if (params.page_size !== undefined) query.set('page_size', String(params.page_size))
      return request(`${patientPath(id)}/comments${query.size ? `?${query}` : ''}`, 'GET', ctx)
    },
    createComment: (id, input, ctx) =>
      request(`${patientPath(id)}/comments`, 'POST', ctx, {
        body: input.body,
        note_ids: input.note_ids,
      }),
    updateComment: (id, commentId, input, ctx) =>
      request(commentPath(id, commentId), 'PUT', ctx, {
        body: input.body,
        note_ids: input.note_ids,
      }),
    deleteComment: (id, commentId, ctx) => request(commentPath(id, commentId), 'DELETE', ctx),
    markCommentsRead: (id, input, ctx) =>
      request(`${patientPath(id)}/comments/read`, 'POST', ctx, {
        through: input.through,
      }),
    getNotificationSummary: async (ctx) =>
      notificationSummaryFromDto(await request('/notifications/summary', 'GET', ctx)),
  }
}

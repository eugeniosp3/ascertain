import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpApi } from './client'
import { createDemoData } from '../fixtures/demo-data'
import { patientToFormValues, toPatientWrite } from '../features/patient-form/mapping'
import type { PatientDetail } from './types'

function stubResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HTTP API', () => {
  it('uses /api, encodes filters, sends the actor and signal, and parses a page', async () => {
    const payload = { items: [], total: 0, page: 2, page_size: 10 }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stubResponse(200, payload))
    const controller = new AbortController()
    const result = await createHttpApi('/api/', fetcher).listPatients(
      { q: 'A & B', page: 2, page_size: 10, has_unread_comments: false, sort_by: 'comments_count' },
      { actorId: 'viewer-1', signal: controller.signal },
    )
    expect(result).toEqual(payload)
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toMatch(/^\/api\/patients\?/)
    const search = new URL(String(url), 'https://example.test').searchParams
    expect(search.get('q')).toBe('A & B')
    expect(search.has('has_unread_comments')).toBe(false)
    expect(search.has('unread_only')).toBe(false)
    expect(search.get('sort_by')).toBe('comments_count')
    expect(init?.signal).toBe(controller.signal)
    expect(init?.headers).toMatchObject({ 'X-Demo-User-ID': 'viewer-1' })
  })

  it('sends assigned_to=me only for the assigned cohort; the directory stays unfiltered', async () => {
    const row = { ...createDemoData().patients[0]!, name: 'A', age: 1 }
    const payload = { items: [row], total: 1, page: 1, page_size: 100 }
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => stubResponse(200, payload))
    const api = createHttpApi('/api', fetcher)
    const page = await api.listPatients({ assigned_to: 'me', page_size: 100 }, { actorId: 'v' })
    expect(page.items[0]!.assigned_user_id).toBe(row.assigned_user_id)
    await api.listPatients({ page_size: 100 }, { actorId: 'v' })
    const [assigned, directory] = fetcher.mock.calls.map(
      ([url]) => new URL(String(url), 'https://example.test').searchParams,
    )
    expect(Object.fromEntries(assigned!)).toEqual({ page_size: '100', assigned_to: 'me' })
    expect(directory!.has('assigned_to')).toBe(false)
  })

  it('does not parse a successful empty 204', async () => {
    const response = stubResponse(204)
    const json = vi.spyOn(response, 'json')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(createHttpApi('/api', fetcher).deletePatient('patient')).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('maps nested body paths and retains query/path locations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      stubResponse(422, {
        error: {
          code: 'validation_error',
          message: 'Request validation failed.',
          fields: [
            {
              path: ['body', 'conditions', 2, 'label'],
              code: 'missing',
              message: 'Field is required.',
            },
            { path: ['body', 'date_of_birth'], code: 'value_error', message: 'Invalid date.' },
            { path: ['query', 'page_size'], code: 'greater_than', message: 'Out of range.' },
          ],
        },
      }),
    )
    await expect(createHttpApi('/api', fetcher).listPatients({})).rejects.toMatchObject({
      status: 422,
      kind: 'validation',
      code: 'validation_error',
      fieldErrors: {
        'conditions[2].label': 'Field is required.',
        date_of_birth: 'Invalid date.',
        'query.page_size': 'Out of range.',
      },
    })
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [410, 'gone'],
  ])('distinguishes HTTP %i as %s', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      stubResponse(status, {
        error: { code: kind, message: 'Safe public message.', fields: [] },
      }),
    )
    await expect(createHttpApi('/api', fetcher).getPatient('patient')).rejects.toMatchObject({
      status,
      kind,
    })
  })

  it('redacts unexpected server data without inspecting its body', async () => {
    const response = stubResponse(500, {
      error: { message: 'private SQL or clinical content', fields: [] },
    })
    const json = vi.spyOn(response, 'json')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(createHttpApi('/api', fetcher).listUsers()).rejects.toMatchObject({
      status: 500,
      kind: 'server',
      code: 'server_error',
      message: 'The service is unavailable. Try again.',
      fieldErrors: {},
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('normalizes malformed non-JSON errors and invalid success JSON', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<html>not found</html>', { status: 404 }))
      .mockResolvedValueOnce(new Response('<html>SPA page</html>', { status: 200 }))
    const api = createHttpApi('/api', fetcher)
    await expect(api.listUsers()).rejects.toMatchObject({ status: 404, kind: 'not_found' })
    await expect(api.listUsers()).rejects.toMatchObject({
      status: 200,
      kind: 'server',
      code: 'invalid_response',
    })
  })

  it('reports network failures and never retries a write', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      createHttpApi('/api', fetcher).createComment('patient', { body: 'Hello', note_ids: [] }),
    ).rejects.toMatchObject({ status: 0, kind: 'network', code: 'network_error' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('preserves AbortError from fetch and body reading, and avoids pre-aborted calls', async () => {
    const aborted = new DOMException('Canceled', 'AbortError')
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(aborted)
    const api = createHttpApi('/api', fetcher)
    await expect(api.listUsers()).rejects.toBe(aborted)
    const response = stubResponse(200, [])
    vi.spyOn(response, 'json').mockRejectedValue(aborted)
    fetcher.mockResolvedValueOnce(response)
    await expect(api.listUsers()).rejects.toBe(aborted)
    const controller = new AbortController()
    controller.abort(aborted)
    await expect(api.listUsers({ signal: controller.signal })).rejects.toBe(aborted)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('uses exact nested routes and excludes caller-supplied authors from write bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => stubResponse(201, {}))
    const api = createHttpApi('/api', fetcher)
    const input = { body: 'Hello', note_ids: ['note'], author_id: 'forged' }
    await api.createComment('patient', input, { actorId: 'real-viewer' })
    await api.markCommentsRead('patient', { through: '2026-11-20T15:00:00.123456+00:00' })
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/patients/patient/comments')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      body: 'Hello',
      note_ids: ['note'],
    })
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/patients/patient/comments/read')
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      through: '2026-11-20T15:00:00.123456+00:00',
    })
  })

  it('normalizes actual patient wire fields while preserving names and typed source context', async () => {
    const seed = createDemoData().patients[0]!
    const { middle_initial, ...wireRow } = {
      ...seed,
      name: 'Server display name',
      age: 86,
      notes_count: 4,
      comments_count: 3,
      unread_comments_count: 1,
    }
    const source_lineage = {
      bronze_id: seed.id,
      silver_id: seed.id,
      source_row_number: 1,
      export_id: null,
      source_file_id: null,
      transformation_version: 'v1',
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        stubResponse(200, { items: [wireRow], total: 1, page: 1, page_size: 20 }),
      )
      .mockResolvedValueOnce(
        stubResponse(200, { ...wireRow, middle_initial, profile_details: null, source_lineage }),
      )
      .mockResolvedValueOnce(stubResponse(200, { ...wireRow, middle_initial, source_lineage }))
    const api = createHttpApi('/api', fetcher)
    const page = await api.listPatients({ has_unread_comments: true })
    expect(page.items[0]).toMatchObject({ middle_initial: null, name: 'Server display name' })
    expect(
      new URL(String(fetcher.mock.calls[0]![0]), 'https://example.test').searchParams.get(
        'unread_only',
      ),
    ).toBe('true')
    const patient = await api.getPatient(seed.id)
    expect(patient).not.toHaveProperty('profile_details')
    expect(patient.source_lineage).toEqual(source_lineage)
    const withContext = await api.getPatient(seed.id)
    expect(withContext.profile_details).toEqual(seed.profile_details)
  })

  it('maps actual notification names once and rejects missing, legacy, or invalid counts', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(stubResponse(200, { unread_comments: 12, patients_with_unread: 4 }))
    const api = createHttpApi('/api', fetcher)
    await expect(api.getNotificationSummary()).resolves.toEqual({
      unread_comments_count: 12,
      patients_with_unread_comments: 4,
    })
    for (const payload of [
      null,
      {},
      { unread_comments_count: 1, patients_with_unread_comments: 1 },
      { unread_comments: -1, patients_with_unread: 1 },
      { unread_comments: '1', patients_with_unread: 1 },
      { unread_comments: 1.5, patients_with_unread: 1 },
      { unread_comments: 1, patients_with_unread: -1 },
      { unread_comments: 1, patients_with_unread: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      fetcher.mockResolvedValueOnce(stubResponse(200, payload))
      await expect(api.getNotificationSummary()).rejects.toMatchObject({ code: 'invalid_response' })
    }
    fetcher.mockResolvedValueOnce(
      stubResponse(200, { unread_comments: 0, patients_with_unread: 0 }),
    )
    await expect(api.getNotificationSummary()).resolves.toEqual({
      unread_comments_count: 0,
      patients_with_unread_comments: 0,
    })
  })

  it('forwards an opaque cursor and returns the server page sequence and exact watermark', async () => {
    const payload = {
      items: [],
      total: 4,
      page: 3,
      page_size: 2,
      read_through: '2026-11-20T10:00:00.123456Z',
      next_cursor: 'opaque-next',
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stubResponse(200, payload))
    const result = await createHttpApi('/api', fetcher).listComments('patient', {
      cursor: 'opaque+/= token',
      page: 99,
      page_size: 2,
    })
    expect(result).toEqual(payload)
    const query = new URL(String(fetcher.mock.calls[0]![0]), 'https://example.test').searchParams
    expect(Object.fromEntries(query)).toEqual({ cursor: 'opaque+/= token', page_size: '2' })
  })

  it('sends complete editable patient PUT bodies and never sends readonly or nested source fields', async () => {
    const seed = createDemoData().patients[0]!
    const patient: PatientDetail = {
      ...seed,
      name: 'Source Name',
      age: 86,
      notes_count: 4,
      comments_count: 3,
      unread_comments_count: 1,
    }
    const write = toPatientWrite(patientToFormValues(patient))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stubResponse(200, patient))
    const input = {
      ...patient,
      ...write,
      conditions: [{ code: 'I10', label: 'Updated label', source_record: 'private' }],
    }
    await createHttpApi('/api', fetcher).updatePatient(patient.id, input)
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      ...write,
      conditions: [{ code: 'I10', label: 'Updated label' }],
    })
  })

  it('exposes useful typed errors', () => {
    const error = new ApiError(410, 'gone', 'Deleted note.')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Deleted note.')
    expect(error.kind).toBe('gone')
  })

  it('accepts llm and template summaries and rejects an unknown method or a bad model', async () => {
    const base = { patient_id: 'p', summary: 'Text', generated_at: '2026-11-20T12:00:00Z' }
    const reply = (body: unknown) =>
      createHttpApi('/api', vi.fn<typeof fetch>().mockResolvedValue(stubResponse(200, body)))
    await expect(
      reply({ ...base, method: 'llm', model: 'gemma-3-27b' }).getSummary('p'),
    ).resolves.toEqual({ ...base, method: 'llm', model: 'gemma-3-27b' })
    await expect(
      reply({ ...base, method: 'template', model: null }).getSummary('p'),
    ).resolves.toEqual({ ...base, method: 'template' })
    for (const body of [{ ...base, method: 'magic' }, { ...base, method: 'llm', model: 7 }, null]) {
      await expect(reply(body).getSummary('p')).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })
})

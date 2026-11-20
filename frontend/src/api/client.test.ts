import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpApi } from './client'

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
    expect(search.get('has_unread_comments')).toBe('false')
    expect(search.get('sort_by')).toBe('comments_count')
    expect(init?.signal).toBe(controller.signal)
    expect(init?.headers).toMatchObject({ 'X-Demo-User-ID': 'viewer-1' })
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
    await api.markCommentsRead('patient', ['observed'])
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/patients/patient/comments')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      body: 'Hello',
      note_ids: ['note'],
    })
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/patients/patient/comments/read')
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      comment_ids: ['observed'],
    })
  })

  it('exposes useful typed errors', () => {
    const error = new ApiError(410, 'gone', 'Deleted note.')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Deleted note.')
    expect(error.kind).toBe('gone')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('explicit data mode', () => {
  it('defaults to the isolated demo without making HTTP calls', async () => {
    vi.stubEnv('VITE_DATA_MODE', undefined)
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const { api, dataMode } = await import('./index')
    expect(dataMode).toBe('demo')
    const users = await api.listUsers()
    expect((await api.listPatients({}, { actorId: users[0]!.id })).total).toBe(100)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses the configured API exclusively and surfaces failures', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE', '/api/custom')
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetcher)
    const { api, dataMode } = await import('./index')
    expect(dataMode).toBe('api')
    await expect(api.listUsers()).rejects.toMatchObject({ kind: 'network' })
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/custom/users')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('rejects an invalid mode instead of quietly selecting demo', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'invalid')
    await expect(import('./index')).rejects.toThrow('VITE_DATA_MODE must be demo or api.')
  })
})

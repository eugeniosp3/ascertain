import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/api'
import { actorId, patientId, patient } from '@/features/patient-detail/test-data'
import { patientDetailOptions } from './patient-query'
import { patientKeys } from './query-keys'

const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return { client, options: { ...patientDetailOptions(client, patientId, actorId), staleTime: 0 } }
}
afterEach(() => clients.splice(0).forEach((client) => client.clear()))

describe('patient access cache boundary', () => {
  it.each([401, 403, 404, 410])(
    'discards a %s record until a later fetch succeeds',
    async (status) => {
      const get = vi.spyOn(api, 'getPatient').mockResolvedValue(patient)
      const { client, options } = setup()
      await client.fetchQuery(options)
      const otherActor = 'another-actor'
      client.setQueryData(patientKeys.detail(patientId, otherActor), patient)
      get.mockRejectedValueOnce(new ApiError(status, 'unavailable', 'Record unavailable.'))
      await expect(client.fetchQuery(options)).rejects.toMatchObject({ status })
      expect(client.getQueryData(options.queryKey)).toBeUndefined()
      get.mockRejectedValueOnce(new ApiError(503, 'network', 'Temporary failure.'))
      await expect(client.fetchQuery(options)).rejects.toMatchObject({ status: 503 })
      expect(client.getQueryData(options.queryKey)).toBeUndefined()
      expect(client.getQueryData(patientKeys.detail(patientId, otherActor))).toEqual(patient)
      await expect(client.fetchQuery(options)).resolves.toEqual(patient)
      expect(client.getQueryData(options.queryKey)).toEqual(patient)
    },
  )

  it('keeps cached detail on an ordinary recoverable refresh failure', async () => {
    const get = vi.spyOn(api, 'getPatient').mockResolvedValue(patient)
    const { client, options } = setup()
    await client.fetchQuery(options)
    get.mockRejectedValueOnce(new ApiError(503, 'network', 'Temporary failure.'))
    await expect(client.fetchQuery(options)).rejects.toMatchObject({ status: 503 })
    expect(client.getQueryData(options.queryKey)).toEqual(patient)
  })
})

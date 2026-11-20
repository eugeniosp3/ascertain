import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, dataMode, isApiError } from '@/api'
import { patientKeys } from './query-keys'

/** Cached detail recovery: retain data on transient refresh failures, but clear denied/deleted records. */
export function patientDetailOptions(client: QueryClient, patientId: string, actorId: string) {
  const queryKey = patientKeys.detail(patientId, actorId)
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await api.getPatient(patientId, { actorId, signal })
      } catch (error) {
        if (isApiError(error) && [401, 403, 404, 410].includes(error.status)) {
          // Clear the existing query without starting an automatic retry or removing its observer.
          client.getQueryCache().find({ queryKey, exact: true })?.setState({
            data: undefined,
            dataUpdatedAt: 0,
          })
        }
        throw error
      }
    },
    meta: { dataMode },
  })
}

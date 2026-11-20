import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, dataMode } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { listParams, type ListSearch, type ListView } from './search-params'

export function usePatientList(search: ListSearch, view: ListView, actorId: string | null) {
  const params = listParams(search, view)
  // Query caching: viewer identity and list parameters distinguish independently cached results.
  return useQuery({
    queryKey: patientKeys.list(actorId, params),
    // Request cancellation: pass Query's abort signal through the adapter to the underlying request.
    queryFn: ({ signal }) => api.listPatients(params, { actorId: actorId ?? undefined, signal }),
    enabled: actorId !== null,
    meta: { dataMode },
    // Placeholder data: keep old rows during refresh only within the same viewer, view and data mode.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey
      const sameView = key?.[3]?.has_unread_comments === params.has_unread_comments
      return key?.[2] === actorId && sameView && previousQuery?.meta?.dataMode === dataMode
        ? keepPreviousData(previous)
        : undefined
    },
  })
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { retryQuery } from '@/app/query-client'
import { fetchOverviewProjection } from './projection'

// The selected actor's complete assigned cohort feeds every chart and the recent-visits list.
export function useOverviewProjection(actorId: string | null) {
  return useQuery({
    queryKey: patientKeys.overview(actorId, 'assigned'),
    queryFn: ({ signal }) => fetchOverviewProjection(api.listPatients, actorId!, signal),
    enabled: actorId !== null,
    staleTime: 30_000,
    retry: retryQuery,
  })
}

import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { patientKeys } from '@/app/query-keys'

export function useNotificationSummary(actorId: string | null) {
  return useQuery({
    queryKey: patientKeys.notificationSummary(actorId),
    queryFn: ({ signal }) => api.getNotificationSummary({ actorId: actorId ?? undefined, signal }),
    enabled: actorId !== null,
  })
}

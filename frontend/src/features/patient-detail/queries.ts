import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { notificationKeys, patientKeys } from '@/app/query-keys'
import { patientDetailOptions } from '@/app/patient-query'

export function usePatientDetail(patientId: string, actorId: string) {
  const client = useQueryClient()
  return useQuery(patientDetailOptions(client, patientId, actorId))
}

// Clinical-note query: keep notes in their own cache and let the panel control when fetching is enabled.
export function usePatientNotes(patientId: string, actorId: string, enabled = true) {
  return useQuery({
    queryKey: patientKeys.notes(patientId),
    queryFn: ({ signal }) => api.listNotes(patientId, { actorId, signal }),
    enabled,
  })
}

/** Activity invalidation: refetch shared counts for all viewers without copying one viewer's unread state. */
export async function invalidateActivity(client: QueryClient, patientId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: patientKeys.lists() }),
    client.invalidateQueries({ queryKey: patientKeys.detail(patientId) }),
    client.invalidateQueries({ queryKey: patientKeys.allComments(patientId) }),
    client.invalidateQueries({ queryKey: notificationKeys.all }),
  ])
}

// Summary refresh: note changes affect clinical prose as well as note lists and patient activity counts.
export async function invalidateNotes(client: QueryClient, patientId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: patientKeys.notes(patientId) }),
    client.invalidateQueries({ queryKey: patientKeys.summary(patientId) }),
    invalidateActivity(client, patientId),
  ])
}

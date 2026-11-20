import type { PatientListParams } from '@/api/types'

// Cache identity: viewer-dependent keys include the actor so unread data stays separate.
// Shorter prefix keys let mutations invalidate related records across multiple viewers.
export const patientKeys = {
  all: ['patients'] as const,
  lists: (actorId?: string | null) =>
    actorId === undefined
      ? (['patients', 'list'] as const)
      : (['patients', 'list', actorId] as const),
  list: (actorId: string | null, params: PatientListParams) =>
    ['patients', 'list', actorId, params] as const,
  detail: (id: string, actorId?: string | null) =>
    actorId === undefined
      ? (['patients', 'detail', id] as const)
      : (['patients', 'detail', id, actorId] as const),
  notes: (id: string) => ['patients', id, 'notes'] as const,
  note: (id: string, noteId: string) => ['patients', id, 'notes', noteId] as const,
  summary: (id: string) => ['patients', id, 'summary'] as const,
  comments: (id: string, actorId: string | null, pageParams?: object) =>
    pageParams === undefined
      ? (['patients', id, 'comments', actorId] as const)
      : (['patients', id, 'comments', actorId, pageParams] as const),
  notificationSummary: (actorId: string | null) => ['notifications', actorId, 'summary'] as const,
}

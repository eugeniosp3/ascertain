import type { PatientListParams } from '@/api/types'

// The demo-user directory is the same for every viewer, so its key carries no actor.
export const userKeys = {
  all: ['demo-users'] as const,
}

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
  // One cohort projection per viewer and scope, under the list prefix so every patient/note
  // mutation that invalidates lists also refreshes the overview.
  overview: (actorId: string | null, scope: 'assigned') =>
    ['patients', 'list', actorId, 'overview-projection', scope] as const,
  detail: (id: string, actorId?: string | null) =>
    actorId === undefined
      ? (['patients', 'detail', id] as const)
      : (['patients', 'detail', id, actorId] as const),
  // Every per-patient record cached under the patient ID (notes, summary, comments); not detail.
  patient: (id: string) => ['patients', id] as const,
  notes: (id: string) => ['patients', id, 'notes'] as const,
  note: (id: string, noteId: string) => ['patients', id, 'notes', noteId] as const,
  summary: (id: string) => ['patients', id, 'summary'] as const,
  // Every viewer's discussion pages for one patient.
  allComments: (id: string) => ['patients', id, 'comments'] as const,
  comments: (id: string, actorId: string | null, pageParams?: object) =>
    pageParams === undefined
      ? (['patients', id, 'comments', actorId] as const)
      : (['patients', id, 'comments', actorId, pageParams] as const),
  notificationSummary: (actorId: string | null) => ['notifications', actorId, 'summary'] as const,
}

// Notification prefixes: `all` refreshes every viewer's inbox; `actor` covers one viewer's queries.
export const notificationKeys = {
  all: ['notifications'] as const,
  actor: (actorId: string | null) => ['notifications', actorId] as const,
}

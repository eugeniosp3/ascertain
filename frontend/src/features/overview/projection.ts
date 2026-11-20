import type { DashboardApi, PatientListItem } from '@/api/types'

export interface OverviewProjection {
  /** Whose patients these are: the selected actor's assigned cohort, never the shared directory. */
  scope: 'assigned'
  patients: PatientListItem[]
  asOfDate: string
}

export class IncompleteProjectionError extends Error {
  constructor() {
    super('A complete patient overview could not be verified. Please retry.')
    this.name = 'IncompleteProjectionError'
  }
}

/**
 * Publish the actor's assigned cohort only after every page has passed completeness and membership
 * checks: a stable total and paging, no missing or duplicate IDs, and every row assigned to them.
 */
export async function fetchOverviewProjection(
  listPatients: DashboardApi['listPatients'],
  actorId: string,
  signal: AbortSignal,
  clock: () => Date = () => new Date(),
): Promise<OverviewProjection> {
  const asOfDate = clock().toISOString().slice(0, 10)
  const patients: PatientListItem[] = []
  const ids = new Set<string>()
  const pageSize = 100
  let total: number | undefined
  let page = 1
  do {
    signal.throwIfAborted()
    const response = await listPatients(
      { assigned_to: 'me', page, page_size: pageSize, sort_by: 'name', order: 'asc' },
      { actorId, signal },
    )
    signal.throwIfAborted()
    if (
      !Number.isSafeInteger(response.total) ||
      response.total < 0 ||
      response.page !== page ||
      response.page_size !== pageSize ||
      (total !== undefined && response.total !== total) ||
      !Array.isArray(response.items) ||
      response.items.length !== Math.min(pageSize, response.total - (page - 1) * pageSize)
    )
      throw new IncompleteProjectionError()
    total = response.total
    for (const patient of response.items) {
      if (
        typeof patient?.id !== 'string' ||
        patient.id.trim() === '' ||
        ids.has(patient.id) ||
        patient.assigned_user_id !== actorId
      )
        throw new IncompleteProjectionError()
      ids.add(patient.id)
      patients.push(patient)
    }
    page += 1
  } while (patients.length < total)
  signal.throwIfAborted()
  return { scope: 'assigned', patients, asOfDate }
}

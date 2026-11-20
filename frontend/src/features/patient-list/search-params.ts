import { z } from 'zod'
import type { PatientListParams } from '@/api/types'
import type { SortingState } from '@tanstack/react-table'

// URL validation: normalize untrusted query strings and supply safe list defaults.
const positiveInteger = z.coerce.number().int().min(1).max(1_000_000).catch(1)
const listSearchSchema = z.object({
  q: z.string().trim().max(200).catch(''),
  status: z.enum(['all', 'active', 'inactive']).catch('all'),
  sort_by: z
    .enum(['name', 'dob', 'last_visit', 'status', 'notes_count', 'comments_count'])
    .catch('name'),
  order: z.enum(['asc', 'desc']).catch('asc'),
  page: positiveInteger,
  page_size: z.coerce
    .number()
    .pipe(z.union([z.literal(20), z.literal(50), z.literal(100)]))
    .catch(20),
})

export type ListSearch = z.infer<typeof listSearchSchema>
export type ListView = 'patients' | 'notifications'
export type PatientTab = 'overview' | 'notes' | 'summary' | 'discussion'
export type WorkspaceSearch = ListSearch & { tab: PatientTab; returnTo: ListView }

export function validateListSearch(value: unknown): ListSearch {
  return listSearchSchema.parse(value && typeof value === 'object' ? value : {})
}

export const defaultListSearch = validateListSearch({})

// Workspace context: carry the selected tab and return destination alongside the list query.
export function validateWorkspaceSearch(value: Record<string, unknown>): WorkspaceSearch {
  return {
    ...validateListSearch(value),
    tab: z.enum(['overview', 'notes', 'summary', 'discussion']).catch('overview').parse(value.tab),
    returnTo: z.enum(['patients', 'notifications']).catch('patients').parse(value.returnTo),
  }
}

// API projection: convert UI choices into the adapter's query fields and omit inactive filters.
export function listParams(search: ListSearch, view: ListView): PatientListParams {
  return {
    ...(search.q ? { q: search.q } : {}),
    ...(search.status === 'all' ? {} : { status: search.status }),
    sort_by: search.sort_by,
    order: search.order,
    page: search.page,
    page_size: search.page_size,
    ...(view === 'notifications' ? { has_unread_comments: true } : {}),
  }
}

/** Age sorting: URL order is the server's DOB order; age runs in the opposite direction. */
export function tableSorting(search: ListSearch): SortingState {
  return [
    {
      id: search.sort_by === 'dob' ? 'age' : search.sort_by,
      desc: search.sort_by === 'dob' ? search.order === 'asc' : search.order === 'desc',
    },
  ]
}

// Sort changes: translate the table's state back into URL fields and return to the first page.
export function searchForSorting(
  sorting: SortingState,
): Pick<ListSearch, 'sort_by' | 'order' | 'page'> {
  const sort = sorting[0] ?? { id: 'name', desc: false }
  const sortBy = sort.id === 'age' ? 'dob' : sort.id
  return {
    sort_by: listSearchSchema.shape.sort_by.parse(sortBy),
    order: sort.id === 'age' ? (sort.desc ? 'asc' : 'desc') : sort.desc ? 'desc' : 'asc',
    page: 1,
  }
}

export function clampPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

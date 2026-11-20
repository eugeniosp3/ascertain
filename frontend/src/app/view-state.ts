import {
  defaultListSearch,
  type ListView,
  type PatientTab,
} from '@/features/patient-list/search-params'
import { emptyListView, useUIStore, type ListViewState } from './ui-store'
import type { PatientListGeometry } from '@/features/patient-list/scroll-restoration'
export type { ListViewState } from './ui-store'

// Return-to-list snapshots: each viewer and list/notification view keeps its own position.
function viewKey(view: ListView, actorId: string | null): string {
  return JSON.stringify([view, actorId])
}

export function getListView(view: ListView, actorId: string | null): ListViewState {
  return useUIStore.getState().returnSnapshots[viewKey(view, actorId)] ?? emptyListView()
}

export function useSavedListSearch(view: ListView, actorId: string | null) {
  return (
    useUIStore((state) => state.returnSnapshots[viewKey(view, actorId)]?.search) ??
    defaultListSearch
  )
}

export function updateListView(
  view: ListView,
  actorId: string | null,
  patch: Partial<ListViewState>,
) {
  const previous = getListView(view, actorId)
  const changedSearch =
    patch.search && JSON.stringify(previous.search) !== JSON.stringify(patch.search)
  useUIStore.getState().updateListView(viewKey(view, actorId), {
    ...(changedSearch ? { geometry: null } : {}),
    ...patch,
  })
}

export function resetListView(view: ListView, actorId: string | null) {
  updateListView(view, actorId, {
    search: { ...defaultListSearch },
    scrollTop: 0,
    restoreFocus: false,
    geometry: null,
  })
}

// Navigation memory: remember which patient and action opened detail so closing can restore focus.
export function rememberPatient(
  view: ListView,
  actorId: string | null,
  id: string,
  index: number,
  tab: PatientTab,
  geometry: PatientListGeometry | null = null,
) {
  updateListView(view, actorId, {
    lastPatientId: id,
    lastRowIndex: index,
    triggerTab: tab,
    restoreFocus: true,
    geometry,
    ...(geometry ? { scrollTop: geometry.scrollTop } : {}),
  })
}

// History Forward starts another visit without activating the list link again.
// Reuse its origin snapshot; tab changes and linked notes must not replace that origin.
export function resumePatientVisit(view: ListView, actorId: string | null, id: string) {
  const snapshot = getListView(view, actorId)
  if (snapshot.lastPatientId === id && !snapshot.restoreFocus) {
    updateListView(view, actorId, { restoreFocus: true })
  }
}

// Focus fallback: if the old patient disappeared, use a nearby surviving row or the list heading.
export function restoredRowIndex(ids: string[], state: ListViewState): number | null {
  if (ids.length === 0) return null
  const previousIndex = state.lastPatientId ? ids.indexOf(state.lastPatientId) : -1
  return previousIndex >= 0 ? previousIndex : Math.min(state.lastRowIndex, ids.length - 1)
}

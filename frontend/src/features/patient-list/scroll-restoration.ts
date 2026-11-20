import type { VirtualItem } from '@tanstack/react-virtual'
import type { PatientListItem } from '@/api/types'
import type { ListSearch, ListView } from './search-params'

/** Navigation memory contains UI measurements only; patient records stay in the query cache. */
export interface PatientListGeometry {
  scope: string
  measurements: VirtualItem[]
  scrollTop: number
  viewport: { width: number; height: number }
  rowTop: number
  actionTop: number | null
  pin: 'top' | 'end' | null
}

export function patientListScope(
  view: ListView,
  actorId: string | null,
  search: ListSearch,
  items: PatientListItem[],
  mobile: boolean,
): string {
  // A content revision invalidates sizes after edits as well as insertion/reordering.
  // Only the revision is retained; no names or clinical data are copied into UI state.
  const content = JSON.stringify(items)
  let revision = 2166136261
  for (let index = 0; index < content.length; index++) {
    revision = Math.imul(revision ^ content.charCodeAt(index), 16777619)
  }
  return JSON.stringify([
    view,
    actorId,
    search,
    mobile,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
    revision >>> 0,
  ])
}

export function capturePatientListGeometry(
  scroller: HTMLElement,
  action: HTMLAnchorElement,
  scope: string,
  measurements: VirtualItem[],
): PatientListGeometry | null {
  const row = action.closest<HTMLElement>('[data-patient-id]')
  if (!row || !scroller.contains(row)) return null
  const viewport = scroller.getBoundingClientRect()
  const actionRect = action.getBoundingClientRect()
  return {
    scope,
    measurements,
    scrollTop: scroller.scrollTop,
    viewport: { width: scroller.clientWidth, height: scroller.clientHeight },
    rowTop: row.getBoundingClientRect().top - viewport.top,
    actionTop:
      actionRect.bottom > viewport.top && actionRect.top < viewport.bottom
        ? actionRect.top - viewport.top
        : null,
    pin:
      scroller.scrollTop === 0
        ? 'top'
        : scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 2
          ? 'end'
          : null,
  }
}

export function matchesPatientListViewport(geometry: PatientListGeometry, scroller: HTMLElement) {
  return (
    geometry.viewport.width === scroller.clientWidth &&
    geometry.viewport.height === scroller.clientHeight
  )
}

export function patientListAnchorOffset(
  scroller: HTMLElement,
  row: HTMLElement,
  geometry: PatientListGeometry,
): number {
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  if (geometry.pin === 'top') return 0
  if (geometry.pin === 'end') return max
  // Align the measured origin, even when its row is clipped and its action is visible.
  const delta =
    row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - geometry.rowTop
  return Math.max(0, Math.min(max, scroller.scrollTop + delta))
}

export function patientListRow(scroller: HTMLElement, id: string | undefined) {
  return Array.from(scroller.querySelectorAll<HTMLElement>('[data-patient-id]')).find(
    (row) => row.dataset.patientId === id,
  )
}

export function patientListAction(row: HTMLElement | undefined, tab: string) {
  return (
    row?.querySelector<HTMLAnchorElement>(`a[data-open-tab="${tab}"]`) ??
    row?.querySelector<HTMLAnchorElement>('a')
  )
}

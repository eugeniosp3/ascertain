import { beforeEach, describe, expect, it } from 'vitest'
import { emptyListView, useUIStore } from './ui-store'
import { getListView, rememberPatient, restoredRowIndex, updateListView } from './view-state'
import { defaultListSearch } from '@/features/patient-list/search-params'
import { patientKeys } from './query-keys'
import { retryQuery } from './query-client'

beforeEach(() =>
  useUIStore.setState({ returnSnapshots: {}, selectedActorId: null, sidebarExpanded: false }),
)

describe('workspace UI state', () => {
  it('keeps patient/notification filters, scroll, and actors independent', () => {
    updateListView('patients', 'one', {
      search: { ...defaultListSearch, q: 'Ada', page: 3 },
      scrollTop: 800,
    })
    rememberPatient('patients', 'one', 'patient-99', 18, 'notes')
    expect(getListView('patients', 'one')).toMatchObject({
      search: { q: 'Ada', page: 3 },
      scrollTop: 800,
      lastPatientId: 'patient-99',
      triggerTab: 'notes',
      restoreFocus: true,
    })
    expect(getListView('notifications', 'one')).toEqual(emptyListView())
    expect(getListView('patients', 'two')).toEqual(emptyListView())
  })
  it('finds the returned record or the next row when a read patient leaves the queue', () => {
    const saved = { ...emptyListView(), lastPatientId: 'b', lastRowIndex: 1 }
    expect(restoredRowIndex(['a', 'b', 'c'], saved)).toBe(1)
    expect(restoredRowIndex(['a', 'c'], saved)).toBe(1)
    expect(restoredRowIndex(['a'], saved)).toBe(0)
    expect(restoredRowIndex([], saved)).toBeNull()
  })
  it('persists preferences without search, patient IDs, or return snapshots', () => {
    useUIStore.getState().setSidebarExpanded(true)
    useUIStore.getState().setSelectedActorId('demo-one')
    rememberPatient('patients', 'demo-one', 'sensitive-record', 6, 'overview')
    const stored = JSON.parse(localStorage.getItem('ascertain:ui-preferences') ?? '{}') as {
      state: object
    }
    expect(stored.state).toEqual({ sidebarExpanded: true, selectedActorId: 'demo-one' })
  })
})

describe('cache boundaries and retry policy', () => {
  it('supports broad invalidation and partitions viewer-specific details', () => {
    expect(patientKeys.lists()).toEqual(['patients', 'list'])
    expect(patientKeys.detail('p')).toEqual(['patients', 'detail', 'p'])
    expect(patientKeys.detail('p', 'one')).not.toEqual(patientKeys.detail('p', 'two'))
    expect(patientKeys.notificationSummary('one')).toEqual(['notifications', 'one', 'summary'])
    expect(patientKeys.comments('p', 'one')).toEqual(['patients', 'p', 'comments', 'one'])
  })
  it('never retries client failures or cancellation and bounds server retries', () => {
    expect(retryQuery(0, { status: 401 })).toBe(false)
    expect(retryQuery(0, { status: 422 })).toBe(false)
    expect(retryQuery(0, new DOMException('Cancelled', 'AbortError'))).toBe(false)
    expect(retryQuery(1, { status: 503 })).toBe(true)
    expect(retryQuery(2, { status: 503 })).toBe(false)
  })
})

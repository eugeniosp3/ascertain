import { beforeEach, describe, expect, it } from 'vitest'
import { emptyListView, useUIStore } from './ui-store'
import {
  getListView,
  rememberPatient,
  restoredRowIndex,
  resumePatientVisit,
  resetListView,
  updateListView,
} from './view-state'
import { defaultListSearch } from '@/features/patient-list/search-params'
import { patientKeys } from './query-keys'
import { retryQuery } from './query-client'

beforeEach(() =>
  useUIStore.setState({
    returnSnapshots: {},
    selectedActorId: null,
    sidebarExpanded: false,
    theme: 'dark',
  }),
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
  it('re-arms a returning history visit without changing its saved list or origin action', () => {
    updateListView('patients', 'one', {
      search: { ...defaultListSearch, q: 'Ada', status: 'active', page: 3 },
      scrollTop: 845,
    })
    rememberPatient('patients', 'one', 'patient-99', 18, 'notes')
    updateListView('patients', 'one', { restoreFocus: false })
    const snapshot = getListView('patients', 'one')
    resumePatientVisit('patients', 'one', 'patient-99')
    expect(getListView('patients', 'one')).toEqual({ ...snapshot, restoreFocus: true })
    const pending = getListView('patients', 'one')
    resumePatientVisit('patients', 'one', 'patient-99')
    expect(getListView('patients', 'one')).toBe(pending)
  })
  it('leaves unrelated patients, viewers and list origins alone', () => {
    rememberPatient('patients', 'one', 'patient-99', 18, 'notes')
    updateListView('patients', 'one', { restoreFocus: false })
    const snapshots = useUIStore.getState().returnSnapshots
    resumePatientVisit('patients', 'one', 'another-patient')
    resumePatientVisit('patients', 'two', 'patient-99')
    resumePatientVisit('notifications', 'one', 'patient-99')
    expect(useUIStore.getState().returnSnapshots).toBe(snapshots)
  })
  it('persists preferences without search, patient IDs, or return snapshots', () => {
    useUIStore.getState().setSidebarExpanded(true)
    useUIStore.getState().setSelectedActorId('demo-one')
    rememberPatient('patients', 'demo-one', 'sensitive-record', 6, 'overview')
    const stored = JSON.parse(localStorage.getItem('ascertain:ui-preferences') ?? '{}') as {
      state: object
    }
    expect(stored.state).toEqual({
      sidebarExpanded: true,
      selectedActorId: 'demo-one',
      theme: 'dark',
    })
  })
  it('retains measured origin memory through history and discards it for a new query or action', () => {
    const geometry = {
      scope: 'patient-list-scope',
      measurements: [{ index: 4, key: 'patient-99', start: 792, end: 990, size: 198, lane: 0 }],
      scrollTop: 700,
      viewport: { width: 364, height: 195 },
      rowTop: 92,
      actionTop: 110,
      pin: null,
    }
    rememberPatient('patients', 'one', 'patient-99', 4, 'notes', geometry)
    updateListView('patients', 'one', { restoreFocus: false, scrollTop: 705 })
    resumePatientVisit('patients', 'one', 'patient-99')
    expect(getListView('patients', 'one').geometry).toBe(geometry)
    expect(JSON.stringify(localStorage.getItem('ascertain:ui-preferences'))).not.toContain(
      'patient-99',
    )
    updateListView('patients', 'one', { search: { ...defaultListSearch, page: 2 } })
    expect(getListView('patients', 'one').geometry).toBeNull()
    rememberPatient('patients', 'one', 'patient-99', 4, 'notes', geometry)
    rememberPatient('patients', 'one', 'new-patient', 0, 'overview')
    expect(getListView('patients', 'one').geometry).toBeNull()
    rememberPatient('patients', 'one', 'patient-99', 4, 'notes', geometry)
    resetListView('patients', 'one')
    expect(getListView('patients', 'one').geometry).toBeNull()
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

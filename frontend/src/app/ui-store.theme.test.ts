import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyListView, useUIStore } from './ui-store'

const storageKey = 'ascertain:ui-preferences'

beforeEach(() => {
  useUIStore.setState({
    sidebarExpanded: false,
    selectedActorId: null,
    theme: 'dark',
    returnSnapshots: {},
  })
  localStorage.clear()
})

describe('theme preference storage', () => {
  it('initializes to dark when there is no saved preference', async () => {
    vi.resetModules()
    const { useUIStore: freshStore } = await import('./ui-store')
    expect(freshStore.getState().theme).toBe('dark')
  })

  it.each(['light', 'dark', 'system'] as const)(
    'initializes from the stored %s preference without losing other preferences',
    async (theme) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          state: { theme, sidebarExpanded: true, selectedActorId: 'one' },
        }),
      )
      vi.resetModules()
      const { useUIStore: freshStore } = await import('./ui-store')
      expect(freshStore.getState()).toMatchObject({
        theme,
        sidebarExpanded: true,
        selectedActorId: 'one',
      })
    },
  )

  it.each([undefined, null, 'sepia', '', 1, true, { theme: 'dark' }])(
    'falls back to dark for an old or invalid theme value: %j',
    async (theme) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          state: { theme, sidebarExpanded: true, selectedActorId: 'one' },
        }),
      )
      await useUIStore.persist.rehydrate()
      expect(useUIStore.getState()).toMatchObject({
        theme: 'dark',
        sidebarExpanded: true,
        selectedActorId: 'one',
      })
    },
  )

  it('persists only theme, sidebar and actor preferences while retaining in-memory list snapshots', async () => {
    const snapshot = { ...emptyListView(), scrollTop: 420, lastPatientId: 'private-record' }
    useUIStore.getState().updateListView('patients:one', snapshot)
    const snapshots = useUIStore.getState().returnSnapshots
    useUIStore.getState().setSidebarExpanded(true)
    useUIStore.getState().setSelectedActorId('one')
    useUIStore.getState().setTheme('dark')
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      version: 1,
      state: { sidebarExpanded: true, selectedActorId: 'one', theme: 'dark' },
    })
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().returnSnapshots).toBe(snapshots)
    expect(useUIStore.getState().returnSnapshots['patients:one']).toEqual(snapshot)
  })

  it('ignores persisted navigation memory and setters', async () => {
    const snapshots = useUIStore.getState().returnSnapshots
    const setTheme = useUIStore.getState().setTheme
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        state: { theme: 'dark', returnSnapshots: { unexpected: {} }, setTheme: 'invalid' },
      }),
    )
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().returnSnapshots).toBe(snapshots)
    expect(useUIStore.getState().setTheme).toBe(setTheme)
  })

  it('remains usable with blocked storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    await expect(useUIStore.persist.rehydrate()).resolves.toBeUndefined()
    expect(() => useUIStore.getState().setTheme('dark')).not.toThrow()
    expect(useUIStore.getState().theme).toBe('dark')
    expect(() => useUIStore.persist.clearStorage()).not.toThrow()
  })

  it('keeps the default when storage contains malformed JSON', async () => {
    localStorage.setItem(storageKey, '{invalid')
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().theme).toBe('dark')
  })
})

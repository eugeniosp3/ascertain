import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import {
  defaultListSearch,
  type ListSearch,
  type PatientTab,
} from '@/features/patient-list/search-params'

export interface ListViewState {
  search: ListSearch
  scrollTop: number
  lastPatientId: string | null
  lastRowIndex: number
  triggerTab: PatientTab
  restoreFocus: boolean
}

export function emptyListView(): ListViewState {
  return {
    search: { ...defaultListSearch },
    scrollTop: 0,
    lastPatientId: null,
    lastRowIndex: 0,
    triggerTab: 'overview',
    restoreFocus: false,
  }
}

// UI state: keep interface preferences and navigation memory here, not server patient records.
interface UIState {
  sidebarExpanded: boolean
  selectedActorId: string | null
  returnSnapshots: Record<string, ListViewState>
  setSidebarExpanded: (expanded: boolean) => void
  setSelectedActorId: (id: string | null) => void
  updateListView: (key: string, patch: Partial<ListViewState>) => void
}

// Optional storage: blocked localStorage must not prevent the application from working.
const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name, value) {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      /* UI preferences are optional. */
    }
  },
  removeItem(name) {
    try {
      window.localStorage.removeItem(name)
    } catch {
      /* UI preferences are optional. */
    }
  },
}

// Shared UI store: components subscribe to the preferences or snapshots they need.
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarExpanded: false,
      selectedActorId: null,
      returnSnapshots: {},
      setSidebarExpanded: (sidebarExpanded) => set({ sidebarExpanded }),
      setSelectedActorId: (selectedActorId) => set({ selectedActorId }),
      updateListView: (key, patch) =>
        set((state) => ({
          returnSnapshots: {
            ...state.returnSnapshots,
            [key]: { ...(state.returnSnapshots[key] ?? emptyListView()), ...patch },
          },
        })),
    }),
    {
      name: 'ascertain:ui-preferences',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Preference persistence: save only sidebar and actor selection; return snapshots stay in memory.
      partialize: ({ sidebarExpanded, selectedActorId }) => ({ sidebarExpanded, selectedActorId }),
      merge: (persisted, current) => {
        const saved =
          persisted && typeof persisted === 'object' ? (persisted as Record<string, unknown>) : {}
        return {
          ...current,
          sidebarExpanded:
            typeof saved.sidebarExpanded === 'boolean'
              ? saved.sidebarExpanded
              : current.sidebarExpanded,
          selectedActorId: typeof saved.selectedActorId === 'string' ? saved.selectedActorId : null,
        }
      },
    },
  ),
)

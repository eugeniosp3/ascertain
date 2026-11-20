import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { User } from '@/api/types'
import { useUIStore } from './ui-store'

interface ActorContextValue {
  actorId: string | null
  user: User | null
  users: User[]
  setActorId: (id: string | null) => void
  isLoading: boolean
  error: Error | null
  retry: () => void
}

const ActorContext = createContext<ActorContextValue | null>(null)

export function ActorProvider({ children }: { children: ReactNode }) {
  const initializedActor = useRef(false)
  const selectedId = useUIStore((state) => state.selectedActorId)
  const setSelectedId = useUIStore((state) => state.setSelectedActorId)
  const query = useQuery({
    queryKey: ['demo-users'],
    queryFn: ({ signal }) => api.listUsers({ signal }),
    staleTime: 5 * 60_000,
  })
  const users = query.data ?? []
  useEffect(() => {
    if (initializedActor.current || !query.data?.length) return
    initializedActor.current = true
    // Start with User A from the actual user list; preserve a valid saved choice.
    if (!query.data.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(query.data[0]!.id)
    }
  }, [query.data, selectedId, setSelectedId])
  // A stale or manually edited storage value never becomes an authorized actor.
  const user = users.find((candidate) => candidate.id === selectedId) ?? null
  const value: ActorContextValue = {
    actorId: user?.id ?? null,
    user,
    users,
    setActorId(id) {
      const validId = users.some((candidate) => candidate.id === id) ? id : null
      setSelectedId(validId)
    },
    isLoading: query.isPending,
    error: query.error,
    retry: () => {
      void query.refetch()
    },
  }

  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- Keep the agreed provider/hook interface together.
export function useActor(): ActorContextValue {
  const context = useContext(ActorContext)
  if (!context) throw new Error('useActor must be used inside ActorProvider')
  return context
}

import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { ActorProvider } from './actor-context'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'
import '@/styles/workspace.css'

export default function App() {
  // Provider lifetime: keep one query cache and router for this mounted application.
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createAppRouter)
  // Provider composition: screens share the cache, selected actor and route context.
  return (
    <QueryClientProvider client={queryClient}>
      <ActorProvider>
        <RouterProvider router={router} />
      </ActorProvider>
    </QueryClientProvider>
  )
}

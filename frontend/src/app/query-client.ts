import { QueryClient } from '@tanstack/react-query'

// Query retry policy: retry transient reads, but not client errors or cancelled requests.
export function retryQuery(failureCount: number, error: unknown): boolean {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined
  if (status !== undefined && status >= 400 && status < 500) return false
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
    return false
  return failureCount < 2
}

export function createQueryClient() {
  // Cache freshness: reuse recent reads, recheck on focus, and never automatically repeat writes.
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: retryQuery, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}

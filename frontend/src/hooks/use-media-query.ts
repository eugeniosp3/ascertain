import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  // External browser state: subscribe to media changes and remove the listener on cleanup.
  // React reads the current match; the server fallback does not assume a viewport size.
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}

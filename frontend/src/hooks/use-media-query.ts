import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  // External browser state: subscribe to media changes and remove the listener on cleanup.
  // A stable subscribe keeps React from re-adding the listener on every render of the caller.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  // React reads the current match; the server fallback does not assume a viewport size.
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}

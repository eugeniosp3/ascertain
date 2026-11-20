import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useUIStore } from './ui-store'

type ResolvedTheme = 'light' | 'dark'

const ThemeContext = createContext<ResolvedTheme | null>(null)
const systemQuery = '(prefers-color-scheme: dark)'

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia(systemQuery).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function subscribeToSystemTheme(onChange: () => void) {
  try {
    const media = window.matchMedia(systemQuery)
    if (
      typeof media.addEventListener === 'function' &&
      typeof media.removeEventListener === 'function'
    ) {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    // Older WebKit exposes the same preference through the legacy listener API.
    if (typeof media.addListener === 'function' && typeof media.removeListener === 'function') {
      media.addListener(onChange)
      return () => media.removeListener(onChange)
    }
  } catch {
    // System preference is optional when the browser does not expose MediaQuery APIs.
  }
  return () => {}
}

/** The shared UI store owns the preference; this provider only resolves and applies it. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useUIStore((state) => state.theme)
  const subscribe = useCallback(
    (onChange: () => void) => (theme === 'system' ? subscribeToSystemTheme(onChange) : () => {}),
    [theme],
  )
  const getSnapshot = useCallback(() => (theme === 'system' ? systemTheme() : theme), [theme])
  const resolvedTheme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as const)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
    root.style.colorScheme = resolvedTheme
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolvedTheme)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#1e1d1c' : '#f4f3ef')
  }, [resolvedTheme])

  // No key or conditional subtree: patient overlays, drafts, routes and caches keep their lifetime.
  return <ThemeContext.Provider value={resolvedTheme}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- Keep the provider and its small hook interface together.
export function useTheme() {
  const theme = useUIStore((state) => state.theme)
  const setTheme = useUIStore((state) => state.setTheme)
  const resolvedTheme = useContext(ThemeContext)
  if (resolvedTheme === null) throw new Error('useTheme must be used inside ThemeProvider')
  return { theme, resolvedTheme, setTheme }
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PatientListItem } from '@/api/types'
import { getListView, restoredRowIndex, updateListView } from '@/app/view-state'
import type { PatientLinkContext } from './PatientOpenLink'
import {
  capturePatientListGeometry,
  matchesPatientListViewport,
  patientListAction,
  patientListAnchorOffset,
  patientListRow,
  patientListScope,
} from './scroll-restoration'

export function usePatientListRestoration({
  items,
  context,
  isMobile,
  busy,
  onFocusHeading,
}: {
  items: PatientListItem[]
  context: PatientLinkContext
  isMobile: boolean
  busy: boolean
  onFocusHeading: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [saved] = useState(() => getListView(context.view, context.actorId))
  const [initialGeometry, setInitialGeometry] = useState(saved.geometry)
  const restored = useRef(false)
  const signature = JSON.stringify(context.search)
  const previousSignature = useRef(signature)
  const scope = patientListScope(context.view, context.actorId, context.search, items, isMobile)
  const previousScope = useRef(scope)
  const geometry = initialGeometry?.scope === scope ? initialGeometry : null
  // This project does not use React Compiler; virtualizer methods intentionally read live measurements.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    // Compact card and desktop row estimates remain the layout owner's values.
    estimateSize: () => (isMobile ? 123 : 64),
    getItemKey: (index) => items[index]?.id ?? index,
    overscan: 4,
    useFlushSync: false,
    scrollMargin: isMobile ? 0 : 42,
    scrollPaddingStart: isMobile ? 0 : 42,
    // TanStack's public snapshot restores measured sizes before calculating the window.
    initialMeasurementsCache: geometry?.measurements ?? [],
    initialOffset: geometry?.scrollTop ?? saved.scrollTop,
    initialRect: { width: 1000, height: 500 },
  })

  const linkContext = useMemo<PatientLinkContext>(
    () => ({
      ...context,
      captureOrigin: (action) =>
        scrollRef.current
          ? capturePatientListGeometry(
              scrollRef.current,
              action,
              scope,
              rowVirtualizer.takeSnapshot(),
            )
          : null,
    }),
    [context, scope, rowVirtualizer],
  )

  const focusRow = (index: number, tab = 'overview') => {
    const row = scrollRef.current ? patientListRow(scrollRef.current, items[index]?.id) : undefined
    const action = patientListAction(row, tab)
    action?.focus({ preventScroll: true })
    return Boolean(action)
  }

  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope
      setInitialGeometry(null)
      rowVirtualizer.measure()
      updateListView(context.view, context.actorId, { geometry: null })
    }
    if (previousSignature.current !== signature) {
      previousSignature.current = signature
      rowVirtualizer.scrollToOffset(0)
      updateListView(context.view, context.actorId, { scrollTop: 0, geometry: null })
    }
  }, [scope, signature, context.view, context.actorId, rowVirtualizer])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (busy || restored.current || !scroller) return
    const measuredOrigin =
      geometry && matchesPatientListViewport(geometry, scroller) ? geometry : null
    if (geometry && !measuredOrigin) {
      // The scroller can change width independently of the window (for example the sidebar).
      // Remove the seed before clearing TanStack's measurements so it cannot be rehydrated.
      setInitialGeometry(null)
      return
    }
    if (saved.geometry && !measuredOrigin) {
      rowVirtualizer.measure()
      updateListView(context.view, context.actorId, { geometry: null })
    }
    rowVirtualizer.scrollToOffset(measuredOrigin?.scrollTop ?? saved.scrollTop)
    if (!saved.restoreFocus) {
      restored.current = true
      return
    }
    const index = restoredRowIndex(
      items.map((item) => item.id),
      saved,
    )
    const id = index === null ? undefined : items[index]?.id
    // Changed/deleted/filtered-away records retain the existing nearest-row fallback.
    // An unchanged origin must never be fully row-aligned: its action was already visible.
    if (index !== null && (!measuredOrigin || id !== saved.lastPatientId)) {
      rowVirtualizer.scrollToIndex(index, { align: 'auto' })
    }
    const alignOrigin = () => {
      const row = patientListRow(scroller, id)
      if (row && measuredOrigin && id === saved.lastPatientId) {
        const offset = patientListAnchorOffset(scroller, row, measuredOrigin)
        if (Math.abs(offset - scroller.scrollTop) > 0.1) rowVirtualizer.scrollToOffset(offset)
      }
      return row
    }
    // Two bounded paint opportunities let the virtual window commit and ResizeObserver
    // deliver its initial measurements. There is no polling or long-lived scroll lock.
    let secondFrame = 0
    const frame = requestAnimationFrame(() => {
      alignOrigin()
      secondFrame = requestAnimationFrame(() => {
        const action = patientListAction(alignOrigin(), saved.triggerTab)
        if (action) action.focus({ preventScroll: true })
        else onFocusHeading()
        restored.current = true
        updateListView(context.view, context.actorId, { restoreFocus: false })
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
    }
  }, [busy, geometry, saved, items, context.view, context.actorId, rowVirtualizer, onFocusHeading])

  return { scrollRef, saved, rowVirtualizer, linkContext, focusRow }
}

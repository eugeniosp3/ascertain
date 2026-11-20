import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Comment } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { timestampMicros } from '@/utils/dates'

// Visibility gating: subscribe to the browser so a hidden document cannot acknowledge discussion.
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}
const pageVisible = () => document.visibilityState === 'visible'

interface DisplayedPage {
  key: string
  through: string
}

/** Mount once per patient/actor visit, retaining the snapshot across tab changes. */
export function useDiscussionRead(
  patientId: string,
  actorId: string,
  active: boolean,
  comments: Comment[],
  readThrough: string | undefined,
  pageKey = 'first',
) {
  const client = useQueryClient()
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, () => false)
  const attempted = useRef(new Set<string>())
  const [displayed, setDisplayed] = useState<Set<string>>(() => new Set())
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set())
  const [highestDisplayed, setHighestDisplayed] = useState<DisplayedPage | null>(null)
  const boundKey = JSON.stringify([pageKey, readThrough])
  // Per-viewer read acknowledgement: submit the displayed page's exact server-issued boundary.
  // Date conversion would discard microseconds at an equal-timestamp group boundary.
  const read = useMutation({
    mutationFn: (page: DisplayedPage) =>
      api.markCommentsRead(patientId, { through: page.through }, { actorId }),
    retry: false,
    // Read-state refresh: authoritative per-viewer counts decide what is still unread.
    onSuccess: async (receipt) => {
      if (receipt.patient_id !== patientId) return
      // The receipt is a watermark, not an absolute count or an observed-ID receipt.
      // Keep the displayed snapshot; refetching page one here would issue a new boundary forever.
      await Promise.all([
        client.invalidateQueries({ queryKey: patientKeys.lists(actorId) }),
        client.invalidateQueries({ queryKey: patientKeys.detail(patientId, actorId) }),
        client.invalidateQueries({ queryKey: ['notifications', actorId] }),
      ])
    },
  })
  const { mutate, isPending, isError } = read
  // Visit labels describe the rendered snapshot, even while an earlier acknowledgment is pending.
  // Guarded visit state also lets Next wait for a visible page without coupling navigation to a write.
  if (active && visible && readThrough) {
    if (!displayed.has(boundKey)) setDisplayed(new Set([...displayed, boundKey]))
    // A displayed later page remains eligible even if the viewer goes Back while a read is pending.
    // Equal or earlier boundaries after navigation or Refresh cannot advance this visit's watermark.
    if (
      !highestDisplayed ||
      timestampMicros(readThrough) > timestampMicros(highestDisplayed.through)
    ) {
      setHighestDisplayed({ key: boundKey, through: readThrough })
    }
    const observed = comments
      .filter(
        (comment) =>
          comment.patient_id === patientId && comment.author.id !== actorId && comment.is_unread,
      )
      .map((comment) => comment.id)
    if (observed.some((id) => !newIds.has(id))) setNewIds(new Set([...newIds, ...observed]))
  }
  // Read eligibility: only an active, visible discussion acknowledges its loaded chronological prefix.
  useEffect(() => {
    if (!active || !visible || !highestDisplayed || isPending || isError) return
    if (attempted.current.has(highestDisplayed.key)) return
    // Record the attempt synchronously, including when React replays effects in Strict Mode.
    attempted.current.add(highestDisplayed.key)
    mutate(highestDisplayed)
  }, [active, visible, highestDisplayed, isPending, isError, mutate])
  return {
    newIds,
    // Next must not skip a page that loaded while the panel or document was hidden.
    pageDisplayed: active && visible && displayed.has(boundKey),
    readError: read.error,
    reading: read.isPending,
    retryRead: () => {
      if (active && visible && !read.isPending && read.variables) read.mutate(read.variables)
    },
  }
}

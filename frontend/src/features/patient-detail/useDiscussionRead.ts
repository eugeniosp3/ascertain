import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Comment, type Page } from '@/api'
import { patientKeys } from '@/app/query-keys'

// Visibility gating: subscribe to the browser so a hidden document cannot acknowledge discussion.
const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}
const pageVisible = () => document.visibilityState !== 'hidden'

/** Mount once per patient/actor visit, retaining the snapshot across tab changes. */
export function useDiscussionRead(
  patientId: string,
  actorId: string,
  active: boolean,
  comments: Comment[],
) {
  const client = useQueryClient()
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, () => false)
  const attempted = useRef(new Set<string>())
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set())
  // Per-viewer read acknowledgement: submit displayed comment IDs through the selected API adapter.
  const read = useMutation({
    mutationFn: (ids: string[]) => api.markCommentsRead(patientId, ids, { actorId }),
    onMutate: (ids) => {
      ids.forEach((id) => attempted.current.add(id))
      setNewIds((previous) => new Set([...previous, ...ids]))
    },
    // Read-state refresh: clear only acknowledged comments, then refetch this viewer's related counts.
    onSuccess: async (receipt) => {
      if (receipt.patient_id !== patientId) return
      const acknowledged = new Set(receipt.read_comment_ids)
      client.setQueriesData<Page<Comment>>(
        { queryKey: patientKeys.comments(patientId, actorId) },
        (page) =>
          page && {
            ...page,
            items: page.items.map((comment) =>
              acknowledged.has(comment.id) ? { ...comment, is_unread: false } : comment,
            ),
          },
      )
      // Receipt counts describe an older snapshot; revalidation must decide the current total.
      await Promise.all([
        client.invalidateQueries({ queryKey: patientKeys.comments(patientId, actorId) }),
        client.invalidateQueries({ queryKey: patientKeys.lists(actorId) }),
        client.invalidateQueries({ queryKey: patientKeys.detail(patientId, actorId) }),
        client.invalidateQueries({ queryKey: ['notifications', actorId] }),
      ])
    },
  })
  const { mutate, isPending, isError } = read
  // Read eligibility: only an active, visible discussion acknowledges unread comments by other authors.
  useEffect(() => {
    if (!active || !visible || isPending || isError) return
    const ids = comments
      .filter(
        (comment) =>
          comment.patient_id === patientId &&
          comment.author.id !== actorId &&
          comment.is_unread &&
          !attempted.current.has(comment.id),
      )
      .map((comment) => comment.id)
    if (ids.length) mutate(ids)
  }, [active, visible, comments, patientId, actorId, isPending, isError, mutate])
  return {
    newIds,
    readError: read.error,
    reading: read.isPending,
    retryRead: () => {
      if (active && visible && !read.isPending && read.variables?.length)
        read.mutate(read.variables)
    },
  }
}

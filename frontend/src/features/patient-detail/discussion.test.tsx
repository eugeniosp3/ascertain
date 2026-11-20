import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { api, ApiError, type Comment, type ReadReceipt } from '@/api'
import { MAX_COMMENT_NOTE_IDS } from '@/api/constraints'
import { patientKeys } from '@/app/query-keys'
import { DiscussionPanel } from './DiscussionPanel'
import { CommentForm } from './CommentForm'
import { CommentItem } from './CommentItem'
import { NoteLinkPicker } from './NoteLinkPicker'
import { useDiscussionRead } from './useDiscussionRead'
import {
  actorId,
  otherActor,
  patientId,
  patient,
  makeComment,
  makeCommentPage,
  makeNote,
} from './test-data'
import { renderFeature } from './test-utils'

// jsdom has no scrolling layout; Radix calls this browser method when focusing an option.
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})
afterAll(() => {
  if (originalScrollIntoView)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

const through = '2026-11-01T14:30:01.123456+00:00'
const receipt = { patient_id: patientId, last_read_at: through }

function ReadHarness({
  comments,
  active,
  boundary = through,
}: {
  comments: Comment[]
  active: boolean
  boundary?: string
}) {
  const read = useDiscussionRead(patientId, actorId, active, comments, boundary)
  return (
    <>
      <p data-testid="snapshot">{[...read.newIds].join(',')}</p>
      {read.readError && <button onClick={read.retryRead}>Retry read</button>}
    </>
  )
}

function CountHarness() {
  const detail = useQuery({
    queryKey: patientKeys.detail(patientId, actorId),
    queryFn: () => api.getPatient(patientId, { actorId }),
  })
  return (
    <>
      <p data-testid="unread-count">{detail.data?.unread_comments_count}</p>
      <DiscussionPanel patientId={patientId} actorId={actorId} active onNoteOpen={vi.fn()} />
    </>
  )
}

const panel = (active = true, viewer = actorId, id = patientId) => (
  <DiscussionPanel patientId={id} actorId={viewer} active={active} onNoteOpen={vi.fn()} />
)

beforeEach(() => {
  vi.spyOn(api, 'listNotes').mockResolvedValue([])
  vi.spyOn(api, 'markCommentsRead').mockResolvedValue(receipt)
  vi.spyOn(api, 'listUsers').mockResolvedValue([
    { id: actorId, display_name: 'Sam Rivera' },
    { id: otherActor, display_name: 'Alex Morgan' },
  ])
})

describe('displayed discussion acknowledgments', () => {
  it('queues the highest displayed boundary when navigating Previous during a pending read', async () => {
    let complete!: (value: ReadReceipt) => void
    const mark = vi
      .mocked(api.markCommentsRead)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
      .mockResolvedValue(receipt)
    const higher = '2026-11-01T14:30:01.123457+00:00'
    const { client, rerender } = renderFeature(
      <ReadHarness comments={[makeComment('first')]} active />,
    )
    await waitFor(() => expect(mark).toHaveBeenCalledOnce())
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[makeComment('second')]} active boundary={higher} />
      </QueryClientProvider>,
    )
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[makeComment('first')]} active />
      </QueryClientProvider>,
    )
    expect(mark).toHaveBeenCalledTimes(1)
    await act(async () => {
      complete(receipt)
    })
    await waitFor(() =>
      expect(mark).toHaveBeenNthCalledWith(2, patientId, { through: higher }, { actorId }),
    )
    expect(screen.getByTestId('snapshot')).toHaveTextContent('first,second')
  })

  it('compares queued boundaries by microsecond instant and keeps the exact winning server string', async () => {
    let complete!: (value: ReadReceipt) => void
    const mark = vi
      .mocked(api.markCommentsRead)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
      .mockResolvedValue(receipt)
    const higher = '2026-11-01T09:30:01.123457-05:00'
    const { client, rerender } = renderFeature(
      <ReadHarness comments={[makeComment('first')]} active />,
    )
    await waitFor(() => expect(mark).toHaveBeenCalledOnce())
    for (const [id, boundary] of [
      ['higher', higher],
      ['equal', '2026-11-01T15:30:01.123457+01:00'],
      ['earlier', '2026-11-01T16:30:01.123456+02:00'],
    ] as const) {
      rerender(
        <QueryClientProvider client={client}>
          <ReadHarness comments={[makeComment(id)]} active boundary={boundary} />
        </QueryClientProvider>,
      )
    }
    await act(async () => {
      complete(receipt)
    })
    await waitFor(() =>
      expect(mark).toHaveBeenNthCalledWith(2, patientId, { through: higher }, { actorId }),
    )
    expect(mark).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('snapshot')).toHaveTextContent('first,higher,equal,earlier')
  })

  it.each(['hidden', 'inactive'] as const)(
    'flushes only the displayed cursor prefix after a pending read settles while %s',
    async (paused) => {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      let completeRead!: (value: ReadReceipt) => void
      let completePage!: (value: ReturnType<typeof makeCommentPage>) => void
      const mark = vi
        .mocked(api.markCommentsRead)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              completeRead = resolve
            }),
        )
        .mockResolvedValue(receipt)
      const displayedBound = '2026-11-01T14:30:01.123457+00:00'
      const unseenBound = '2026-11-01T14:30:01.123458+00:00'
      const list = vi.spyOn(api, 'listComments').mockImplementation(async (_id, params) => {
        if (params.cursor === 'page-three') {
          return new Promise((resolve) => {
            completePage = resolve
          })
        }
        return params.cursor === 'page-two'
          ? makeCommentPage([makeComment('second')], {
              page: 2,
              total: 4,
              next_cursor: 'page-three',
              read_through: displayedBound,
            })
          : makeCommentPage([makeComment('first')], { total: 4, next_cursor: 'page-two' })
      })
      const { client, rerender } = renderFeature(panel())
      await waitFor(() => expect(mark).toHaveBeenCalledOnce())
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByText('Comment second')).toBeVisible()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
      if (paused === 'hidden') {
        visibility.mockReturnValue('hidden')
        act(() => document.dispatchEvent(new Event('visibilitychange')))
      } else {
        rerender(<QueryClientProvider client={client}>{panel(false)}</QueryClientProvider>)
      }
      await act(async () => {
        completePage(
          makeCommentPage([makeComment('third')], {
            page: 3,
            total: 4,
            next_cursor: 'page-four',
            read_through: unseenBound,
          }),
        )
      })
      await screen.findByText('Comment third')
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
      await screen.findByText('Comment second')
      await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
      await screen.findByText('Comment first')
      await act(async () => {
        completeRead(receipt)
      })
      expect(mark).toHaveBeenCalledTimes(1)
      if (paused === 'hidden') {
        visibility.mockReturnValue('visible')
        act(() => document.dispatchEvent(new Event('visibilitychange')))
      } else {
        rerender(<QueryClientProvider client={client}>{panel()}</QueryClientProvider>)
      }
      await waitFor(() =>
        expect(mark).toHaveBeenNthCalledWith(
          2,
          patientId,
          { through: displayedBound },
          { actorId },
        ),
      )
      expect(mark).toHaveBeenCalledTimes(2)
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Comment second')
      expect(mark).toHaveBeenCalledTimes(2)
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByText('Comment third')).toBeVisible()
      await waitFor(() =>
        expect(mark).toHaveBeenNthCalledWith(3, patientId, { through: unseenBound }, { actorId }),
      )
      expect(list).toHaveBeenCalledTimes(3)
    },
  )

  it('lets the author remove a draft note reference that disappeared during the visit', async () => {
    const change = vi.fn()
    renderFeature(
      <NoteLinkPicker
        patientId={patientId}
        actorId={actorId}
        selected={['removed-note']}
        onChange={change}
      />,
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove unavailable references' }),
    )
    expect(change).toHaveBeenCalledWith([])
  })

  it('describes the note-reference group with a plain error instead of an alert', async () => {
    renderFeature(
      <NoteLinkPicker
        patientId={patientId}
        actorId={actorId}
        selected={[]}
        onChange={vi.fn()}
        error="Choose notes for this patient."
      />,
    )
    await screen.findByText('This patient has no active notes to link.')
    // jsdom's description algorithm trims the hidden prefix's trailing space; browsers keep it.
    expect(screen.getByRole('group', { name: /^Link clinical notes/ })).toHaveAccessibleDescription(
      /^Error: ?Choose notes for this patient\.$/,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('leaves newer counts and per-comment unread flags authoritative when an older receipt completes', async () => {
    let complete!: (receipt: ReadReceipt) => void
    const mark = vi.mocked(api.markCommentsRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const first = makeComment('first-seen')
    const later = makeComment('new-arrival')
    const { client } = renderFeature(<ReadHarness comments={[first]} active />)
    await waitFor(() => expect(mark).toHaveBeenCalledOnce())
    client.setQueryData(patientKeys.detail(patientId, actorId), {
      ...patient,
      unread_comments_count: 3,
    })
    client.setQueryData(patientKeys.detail(patientId, otherActor), {
      ...patient,
      unread_comments_count: 7,
    })
    client.setQueryData(
      patientKeys.comments(patientId, actorId, { page: 1 }),
      makeCommentPage([first, later]),
    )
    client.setQueryData(patientKeys.summary(patientId), { summary: 'Clinical summary' })
    await act(async () => {
      complete(receipt)
    })
    expect(client.getQueryData(patientKeys.detail(patientId, actorId))).toMatchObject({
      unread_comments_count: 3,
    })
    expect(client.getQueryState(patientKeys.detail(patientId, actorId))?.isInvalidated).toBe(true)
    expect(client.getQueryState(patientKeys.detail(patientId, otherActor))?.isInvalidated).toBe(
      false,
    )
    expect(client.getQueryState(patientKeys.summary(patientId))?.isInvalidated).toBe(false)
    expect(client.getQueryData(patientKeys.comments(patientId, actorId, { page: 1 }))).toEqual(
      makeCommentPage([first, later]),
    )
  })

  it('waits for an active visible document and sends the microsecond boundary unchanged', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { client, rerender } = renderFeature(
      <ReadHarness comments={[makeComment('visible')]} active={false} />,
    )
    expect(api.markCommentsRead).not.toHaveBeenCalled()
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[makeComment('visible')]} active />
      </QueryClientProvider>,
    )
    expect(api.markCommentsRead).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() =>
      expect(api.markCommentsRead).toHaveBeenCalledExactlyOnceWith(
        patientId,
        { through },
        { actorId },
      ),
    )
  })

  it('snapshots only observed unread comments from this patient and another author', async () => {
    renderFeature(
      <ReadHarness
        active
        comments={[
          makeComment('seen'),
          makeComment('own', { author: { id: actorId, display_name: 'Sam' } }),
          makeComment('already-read', { is_unread: false }),
          makeComment('other-patient', { patient_id: 'another-patient' }),
        ]}
      />,
    )
    await waitFor(() => expect(api.markCommentsRead).toHaveBeenCalledOnce())
    expect(screen.getByTestId('snapshot')).toHaveTextContent(/^seen$/)
  })

  it('cannot read a later boundary or observe new labels after leaving Discussion', async () => {
    let complete!: (receipt: ReadReceipt) => void
    const mark = vi.mocked(api.markCommentsRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const first = makeComment('first')
    const { client, rerender } = renderFeature(<ReadHarness comments={[first]} active />)
    await waitFor(() => expect(mark).toHaveBeenCalledWith(patientId, { through }, { actorId }))
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness
          comments={[first, makeComment('later')]}
          active={false}
          boundary="2026-11-01T14:30:02.999999Z"
        />
      </QueryClientProvider>,
    )
    await act(async () => {
      complete(receipt)
    })
    expect(mark).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('snapshot')).not.toHaveTextContent('later')
  })

  it('snapshots newly displayed pages while an earlier read is pending', async () => {
    let complete!: (receipt: ReadReceipt) => void
    const mark = vi
      .mocked(api.markCommentsRead)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
      .mockResolvedValue(receipt)
    const first = makeComment('first')
    const second = makeComment('second')
    const nextBound = '2026-11-01T14:30:02.999999Z'
    const { client, rerender } = renderFeature(<ReadHarness comments={[first]} active />)
    await waitFor(() => expect(mark).toHaveBeenCalledOnce())
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[second]} active boundary={nextBound} />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('snapshot')).toHaveTextContent('first,second')
    expect(mark).toHaveBeenCalledTimes(1)
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[{ ...second, is_unread: false }]} active boundary={nextBound} />
      </QueryClientProvider>,
    )
    await act(async () => {
      complete(receipt)
    })
    await waitFor(() =>
      expect(mark).toHaveBeenNthCalledWith(2, patientId, { through: nextBound }, { actorId }),
    )
    expect(screen.getByTestId('snapshot')).toHaveTextContent('first,second')
  })

  it('retains unread state on failure, never retries automatically, and retries the exact displayed bound', async () => {
    const mark = vi
      .mocked(api.markCommentsRead)
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Offline.'))
      .mockResolvedValue(receipt)
    const { client, rerender } = renderFeature(
      <ReadHarness comments={[makeComment('failed')]} active />,
    )
    client.setQueryData(patientKeys.detail(patientId, actorId), patient)
    await screen.findByRole('button', { name: 'Retry read' })
    expect(client.getQueryData(patientKeys.detail(patientId, actorId))).toMatchObject({
      unread_comments_count: 1,
    })
    expect(mark).toHaveBeenCalledTimes(1)
    const higher = '2026-11-01T14:30:01.123457+00:00'
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[makeComment('later')]} active boundary={higher} />
      </QueryClientProvider>,
    )
    expect(mark).toHaveBeenCalledTimes(1)
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[makeComment('failed')]} active={false} />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Retry read' }))
    expect(mark).toHaveBeenCalledTimes(1)
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[makeComment('failed')]} active />
      </QueryClientProvider>,
    )
    expect(mark).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Retry read' }))
    await waitFor(() =>
      expect(client.getQueryState(patientKeys.detail(patientId, actorId))?.isInvalidated).toBe(
        true,
      ),
    )
    expect(mark).toHaveBeenNthCalledWith(2, patientId, { through }, { actorId })
    await waitFor(() =>
      expect(mark).toHaveBeenNthCalledWith(3, patientId, { through: higher }, { actorId }),
    )
    expect(mark).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('snapshot')).toHaveTextContent('failed,later')
  })

  it('reports a failed automatic read politely, with Retry beside the live region', async () => {
    const mark = vi
      .mocked(api.markCommentsRead)
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Offline.'))
      .mockResolvedValue(receipt)
    vi.spyOn(api, 'listComments').mockResolvedValue(makeCommentPage([makeComment()]))
    renderFeature(panel())
    const notice = await screen.findByText('Comments could not be marked as read. Offline.')
    expect(notice).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(notice).not.toContainElement(retry)
    await userEvent.click(retry)
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(2))
    // The region stays mounted and only its text clears.
    await waitFor(() => expect(notice).toBeEmptyDOMElement())
    expect(notice).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('acknowledges a displayed bound once when Strict Mode replays effects', async () => {
    const { client, rerender } = renderFeature(
      <StrictMode>
        <ReadHarness comments={[makeComment('strict')]} active />
      </StrictMode>,
    )
    const invalidations = vi.spyOn(client, 'invalidateQueries')
    await waitFor(() =>
      expect(api.markCommentsRead).toHaveBeenCalledExactlyOnceWith(
        patientId,
        { through },
        { actorId },
      ),
    )
    await waitFor(() => expect(invalidations).toHaveBeenCalledTimes(3))
    rerender(
      <QueryClientProvider client={client}>
        <StrictMode>
          <ReadHarness comments={[makeComment('strict')]} active />
        </StrictMode>
      </QueryClientProvider>,
    )
    expect(api.markCommentsRead).toHaveBeenCalledTimes(1)
    expect(invalidations).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('snapshot')).toHaveTextContent('strict')
  })

  it('does not acknowledge a page until its request has loaded', async () => {
    let complete!: (value: ReturnType<typeof makeCommentPage>) => void
    vi.spyOn(api, 'listComments').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    renderFeature(panel())
    expect(await screen.findByRole('status', { name: 'Loading discussion' })).toBeVisible()
    expect(api.markCommentsRead).not.toHaveBeenCalled()
    await act(async () => {
      complete(makeCommentPage([makeComment()]))
    })
    await waitFor(() =>
      expect(api.markCommentsRead).toHaveBeenCalledExactlyOnceWith(
        patientId,
        { through },
        { actorId },
      ),
    )
  })

  it('follows opaque Next cursors and known Previous history, then starts page one at the new size', async () => {
    const list = vi.spyOn(api, 'listComments').mockImplementation(async (_id, params) =>
      params.cursor === 'opaque/next?A='
        ? makeCommentPage([makeComment('second')], {
            page: 2,
            total: 2,
            read_through: '2026-11-01T14:30:02.111111Z',
          })
        : makeCommentPage([makeComment('first')], {
            total: 2,
            next_cursor: params.page_size === 20 ? null : 'opaque/next?A=',
            page_size: params.page_size,
          }),
    )
    const { client } = renderFeature(panel())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    expect(list).toHaveBeenNthCalledWith(
      1,
      patientId,
      { page: 1, page_size: 10 },
      expect.objectContaining({ actorId }),
    )
    // A cursor can exist even when total/page-size arithmetic says there is only one page.
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Comment second')).toBeVisible()
    expect(list).toHaveBeenNthCalledWith(
      2,
      patientId,
      { cursor: 'opaque/next?A=', page_size: 10 },
      expect.objectContaining({ actorId }),
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Comment first')).toBeVisible()
    expect(list).toHaveBeenCalledTimes(2)
    screen.getByRole('combobox', { name: 'Comments per page' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('option', { name: '10' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    expect(list).toHaveBeenLastCalledWith(
      patientId,
      { page: 1, page_size: 20 },
      expect.objectContaining({ actorId }),
    )
    // Both comments now fit on one page with no cursor, so the paging controls step aside.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Page 1 · 2 comments')).toBeVisible()
    const keys = client
      .getQueryCache()
      .findAll({ queryKey: patientKeys.comments(patientId, actorId) })
      .map((query) => query.queryKey.at(-1))
    expect(keys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cursor: null, page_size: 10 }),
        expect.objectContaining({ cursor: 'opaque/next?A=', page_size: 10 }),
        expect.objectContaining({ cursor: null, page_size: 20 }),
      ]),
    )
  })

  it('cannot skip a page loaded in a hidden document', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const list = vi
      .spyOn(api, 'listComments')
      .mockResolvedValue(makeCommentPage([makeComment()], { next_cursor: 'next' }))
    renderFeature(panel())
    await screen.findByText('Comment comment-1')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(list).toHaveBeenCalledTimes(1)
    expect(api.markCommentsRead).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  })

  it('leaves a partial equal-timestamp group unread until its last page is displayed', async () => {
    const sharedTime = '2026-11-01T14:30:00.123456+00:00'
    const partialBound = '2026-11-01T14:30:00.123455+00:00'
    const group = Array.from({ length: 11 }, (_, index) =>
      makeComment(`equal-${index}`, { created_at: sharedTime }),
    )
    let complete = false
    let completePage!: (value: ReturnType<typeof makeCommentPage>) => void
    vi.spyOn(api, 'getPatient').mockImplementation(async () => ({
      ...patient,
      unread_comments_count: complete ? 0 : 11,
    }))
    const list = vi.spyOn(api, 'listComments').mockImplementation(async (_id, params) =>
      params.cursor
        ? new Promise((resolve) => {
            completePage = resolve
          })
        : makeCommentPage(
            group.slice(0, 10).map((comment) => ({ ...comment, is_unread: !complete })),
            { total: 11, next_cursor: 'equal-group', read_through: partialBound },
          ),
    )
    const mark = vi.mocked(api.markCommentsRead).mockImplementation(async (_id, input) => {
      if (input.through === through) complete = true
      return { patient_id: patientId, last_read_at: input.through }
    })
    renderFeature(<CountHarness />)
    await waitFor(() =>
      expect(mark).toHaveBeenCalledExactlyOnceWith(
        patientId,
        { through: partialBound },
        { actorId },
      ),
    )
    expect(screen.getByTestId('unread-count')).toHaveTextContent(/^11$/)
    expect(within(screen.getByRole('list', { name: 'Comments' })).getAllByText('New')).toHaveLength(
      10,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('status', { name: 'Loading discussion' })).toBeVisible()
    expect(screen.getByTestId('unread-count')).toHaveTextContent(/^11$/)
    expect(mark).toHaveBeenCalledTimes(1)
    await act(async () => {
      completePage(makeCommentPage([group[10]!], { total: 11, page: 2 }))
    })
    expect(await screen.findByText('Comment equal-10')).toBeVisible()
    expect(within(screen.getByRole('list', { name: 'Comments' })).getByText('New')).toBeVisible()
    await waitFor(() =>
      expect(mark).toHaveBeenNthCalledWith(2, patientId, { through }, { actorId }),
    )
    await waitFor(() => expect(screen.getByTestId('unread-count')).toHaveTextContent(/^0$/))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh discussion' }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Comments' })).getAllByText('New'),
      ).toHaveLength(10),
    )
    expect(screen.getByTestId('unread-count')).toHaveTextContent(/^0$/)
    // Refresh displays an earlier boundary; the completed group's watermark already covers it.
    // Read invalidations refetch counts without acknowledging that redundant prefix again.
    expect(mark).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('uses a replacement first-page cursor after mutation refetch and preserves the unsent composer', async () => {
    let version = 'old'
    const list = vi
      .spyOn(api, 'listComments')
      .mockImplementation(async (_id, params) =>
        params.cursor
          ? makeCommentPage([makeComment(params.cursor)], { page: 2 })
          : makeCommentPage([makeComment('first')], { next_cursor: `${version}-cursor` }),
      )
    const { client } = renderFeature(panel())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Comment old-cursor')
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Comment/ }),
      'Keep this unsent draft',
    )
    version = 'new'
    await act(async () => {
      await client.invalidateQueries({ queryKey: patientKeys.comments(patientId, actorId) })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    expect(screen.getByText('Comment first')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Comment new-cursor')).toBeVisible()
    expect(list).toHaveBeenLastCalledWith(
      patientId,
      { cursor: 'new-cursor', page_size: 10 },
      expect.objectContaining({ actorId }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Refresh discussion' }))
    expect(await screen.findByText('Comment first')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: /^Comment/ })).toHaveValue('Keep this unsent draft')
  })

  it('keeps an empty continuation after deletions navigable without an offset loop or an undefined cursor', async () => {
    const list = vi
      .spyOn(api, 'listComments')
      .mockImplementation(async (_id, params) =>
        params.cursor
          ? makeCommentPage([], { page: 2, total: 1 })
          : makeCommentPage([makeComment()], { total: 11, next_cursor: 'deleted-tail' }),
      )
    renderFeature(panel())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      await screen.findByRole('heading', { name: 'No comments remain on this page' }),
    ).toBeVisible()
    expect(screen.getByText('Page 2 · 1 comment')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(list).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Comment comment-1')).toBeVisible()
    expect(
      list.mock.calls.every(([, params]) => params.page === 1 || typeof params.cursor === 'string'),
    ).toBe(true)
  })

  it('resets cursor history, labels and drafts on patient/actor changes and scopes a late receipt', async () => {
    let complete!: (receipt: ReadReceipt) => void
    vi.spyOn(api, 'listComments').mockImplementation(async (id, _params, ctx) =>
      makeCommentPage([
        makeComment('actor-a-new', { patient_id: id, is_unread: ctx?.actorId === actorId }),
      ]),
    )
    const mark = vi.mocked(api.markCommentsRead).mockImplementation(async (_id, _input, ctx) =>
      ctx?.actorId === actorId
        ? new Promise((resolve) => {
            complete = resolve
          })
        : receipt,
    )
    const { client, rerender } = renderFeature(panel())
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1))
    await userEvent.type(screen.getByRole('textbox', { name: /^Comment/ }), 'Actor A draft')
    client.setQueryData(patientKeys.detail(patientId, otherActor), {
      ...patient,
      unread_comments_count: 8,
    })
    rerender(<QueryClientProvider client={client}>{panel(true, otherActor)}</QueryClientProvider>)
    expect(await screen.findByRole('textbox', { name: /^Comment/ })).toHaveValue('')
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Comments' })).queryByText('New'),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(2))
    await act(async () => {
      complete(receipt)
    })
    expect(client.getQueryData(patientKeys.detail(patientId, otherActor))).toMatchObject({
      unread_comments_count: 8,
    })
    await userEvent.type(screen.getByRole('textbox', { name: /^Comment/ }), 'Actor B draft')
    rerender(
      <QueryClientProvider client={client}>
        {panel(true, otherActor, 'another-patient')}
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('textbox', { name: /^Comment/ })).toHaveValue('')
    expect(await screen.findByText('Comment actor-a-new')).toBeVisible()
  })
})

describe('comment forms and note references', () => {
  it('shows a posted comment beyond page one immediately without jumping over or acknowledging unseen pages', async () => {
    const initial = Array.from({ length: 10 }, (_, index) =>
      makeComment(`earlier-${index}`, { is_unread: false }),
    )
    const own = makeComment('my-new-comment', {
      body: 'My eleventh comment',
      author: { id: actorId, display_name: 'Sam' },
      is_unread: false,
    })
    let saved = false
    const list = vi.spyOn(api, 'listComments').mockImplementation(async (_id, params) =>
      params.cursor
        ? makeCommentPage([own], {
            page: 2,
            total: 11,
            read_through: '2026-11-01T14:31:01.999999Z',
          })
        : makeCommentPage(initial, {
            total: saved ? 11 : 10,
            next_cursor: saved ? 'after-ten' : null,
          }),
    )
    vi.spyOn(api, 'createComment').mockImplementation(async () => {
      saved = true
      return own
    })
    renderFeature(panel())
    await screen.findByText('Comment earlier-0')
    const composer = screen.getByRole('form', { name: 'Add a comment' })
    await userEvent.type(within(composer).getByRole('textbox', { name: /^Comment/ }), own.body)
    await userEvent.click(within(composer).getByRole('button', { name: 'Post comment' }))
    const confirmation = await within(composer).findByText('Comment posted.')
    expect(confirmation).toBeVisible()
    expect(await screen.findByText(own.body)).toBeVisible()
    const aside = screen.getByRole('complementary', { name: 'Just posted comment' })
    expect(aside).toBeVisible()
    // Both visible confirmations are plain text; one always-mounted live region announces once.
    expect(confirmation).not.toHaveAttribute('role')
    expect(
      within(aside).getByText('Comment posted. Refresh discussion to show it in order.'),
    ).not.toHaveAttribute('role')
    const announcing = [
      ...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'),
    ].filter((region) => region.textContent?.includes('Comment posted'))
    expect(announcing).toHaveLength(1)
    expect(announcing[0]).toHaveTextContent(/^Comment posted\.$/)
    expect(screen.getByRole('textbox', { name: /^Comment/ })).toHaveValue('')
    await waitFor(() => expect(screen.getByText('Page 1 · 11 comments')).toBeVisible())
    expect(
      within(screen.getByRole('list', { name: 'Comments' })).getAllByRole('listitem'),
    ).toHaveLength(10)
    expect(list.mock.calls.every(([, params]) => params.page === 1)).toBe(true)
    expect(api.markCommentsRead).not.toHaveBeenCalledWith(
      patientId,
      { through: '2026-11-01T14:31:01.999999Z' },
      { actorId },
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      await within(screen.getByRole('list', { name: 'Comments' })).findByText(own.body),
    ).toBeVisible()
    expect(
      screen.queryByRole('complementary', { name: 'Just posted comment' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(own.body)).toHaveLength(1)
    expect(
      within(screen.getByRole('list', { name: 'Comments' })).queryByText('New'),
    ).not.toBeInTheDocument()
  })

  it('refreshes the displayed discussion after own edits and deletion without offset pagination', async () => {
    let own: Comment | null = makeComment('owned', {
      author: { id: actorId, display_name: 'Sam' },
      is_unread: false,
    })
    const list = vi
      .spyOn(api, 'listComments')
      .mockImplementation(async () => makeCommentPage(own ? [own] : []))
    const update = vi
      .spyOn(api, 'updateComment')
      .mockImplementation(async (_patient, _comment, input) => {
        own = { ...own!, body: input.body }
        return own
      })
    const remove = vi.spyOn(api, 'deleteComment').mockImplementation(async () => {
      own = null
    })
    renderFeature(panel())
    await userEvent.click(await screen.findByRole('button', { name: 'Edit comment' }))
    const edit = screen.getByRole('form', { name: 'Edit comment' })
    await userEvent.clear(within(edit).getByRole('textbox', { name: /^Comment/ }))
    await userEvent.type(
      within(edit).getByRole('textbox', { name: /^Comment/ }),
      'Updated care-team comment',
    )
    expect(screen.getByRole('button', { name: 'Refresh discussion' })).toBeDisabled()
    // A single page has no paging controls to disable; only the quiet page summary remains.
    expect(screen.queryByRole('combobox', { name: 'Comments per page' })).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 · 1 comment')).toBeVisible()
    await userEvent.click(within(edit).getByRole('button', { name: 'Save comment' }))
    expect(await screen.findByText('Updated care-team comment')).toBeVisible()
    expect(update).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledTimes(2)
    // The closed editor returns focus to its Edit button and the result is announced.
    expect(screen.getByRole('button', { name: 'Edit comment' })).toHaveFocus()
    expect(screen.getByText('Comment saved.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete comment' }),
    )
    expect(await screen.findByRole('heading', { name: 'No comments yet' })).toBeVisible()
    expect(screen.getByText('Comment deleted.')).toBeInTheDocument()
    expect(remove).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Page 1 · 0 comments')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('retains composer text, selected links, edit drafts and visit labels across inactive tabs', async () => {
    const own = makeComment('own', {
      author: { id: actorId, display_name: 'Sam' },
      is_unread: false,
    })
    const unread = makeComment('new-with-link', {
      note_links: [{ id: 'note', label: 'Open note', url: '/ignored', is_deleted: false }],
    })
    vi.mocked(api.listNotes).mockResolvedValue([makeNote()])
    vi.spyOn(api, 'listComments').mockResolvedValue(makeCommentPage([unread, own]))
    const { client, rerender } = renderFeature(panel())
    const composer = await screen.findByRole('form', { name: 'Add a comment' })
    await userEvent.type(
      within(composer).getByRole('textbox', { name: /^Comment/ }),
      'Unsent main draft',
    )
    await userEvent.click(
      await within(composer).findByRole('checkbox', { name: /Follow-up visit/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Edit comment' }))
    const edit = screen.getByRole('form', { name: 'Edit comment' })
    await userEvent.type(within(edit).getByRole('textbox', { name: /^Comment/ }), ' unsent edit')
    rerender(<QueryClientProvider client={client}>{panel(false)}</QueryClientProvider>)
    const calls = vi.mocked(api.markCommentsRead).mock.calls.length
    rerender(<QueryClientProvider client={client}>{panel()}</QueryClientProvider>)
    expect(within(composer).getByRole('textbox', { name: /^Comment/ })).toHaveValue(
      'Unsent main draft',
    )
    expect(within(composer).getByRole('checkbox', { name: /Follow-up visit/ })).toBeChecked()
    expect(within(edit).getByRole('textbox', { name: /^Comment/ })).toHaveValue(
      `${own.body} unsent edit`,
    )
    expect(within(screen.getByRole('list', { name: 'Comments' })).getByText('New')).toBeVisible()
    expect(api.markCommentsRead).toHaveBeenCalledTimes(calls)
  })

  it('allows up to the shared 100-note reference limit and leaves selected notes removable', async () => {
    const notes = Array.from({ length: MAX_COMMENT_NOTE_IDS + 1 }, (_, index) =>
      makeNote({ id: `note-${index}`, content: `Note ${index}` }),
    )
    vi.mocked(api.listNotes).mockResolvedValue(notes)
    const change = vi.fn()
    const selected = notes.slice(0, MAX_COMMENT_NOTE_IDS - 1).map((note) => note.id)
    const { client, rerender } = renderFeature(
      <NoteLinkPicker
        patientId={patientId}
        actorId={actorId}
        selected={selected}
        onChange={change}
      />,
    )
    const hundredth = await screen.findByRole('checkbox', { name: /^Note 99 / })
    expect(hundredth).toBeEnabled()
    await userEvent.click(hundredth)
    expect(change).toHaveBeenLastCalledWith([...selected, notes[99]!.id])
    rerender(
      <QueryClientProvider client={client}>
        <NoteLinkPicker
          patientId={patientId}
          actorId={actorId}
          selected={notes.slice(0, 100).map((note) => note.id)}
          onChange={change}
        />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('checkbox', { name: /^Note 100 / })).toBeDisabled()
    expect(hundredth).toBeEnabled()
    await userEvent.click(hundredth)
    expect(change).toHaveBeenLastCalledWith(selected)
  })

  it('shows literal text and edited time, routes active note links, and hides another author’s actions', async () => {
    const open = vi.fn()
    const comment = makeComment('rendered', {
      body: '<b>Team message</b>',
      updated_at: '2026-11-02T14:00:00Z',
      note_links: [
        { id: 'active-note', label: 'Visit note', url: '/ignored-server-path', is_deleted: false },
        {
          id: 'deleted-note',
          label: 'Earlier note',
          url: '/ignored-server-path',
          is_deleted: true,
        },
      ],
    })
    renderFeature(
      <ol>
        <CommentItem
          patientId={patientId}
          actorId={actorId}
          comment={comment}
          isNew={false}
          onNoteOpen={open}
        />
      </ol>,
    )
    expect(screen.getByText('<b>Team message</b>')).toBeVisible()
    expect(screen.getByText(/Edited/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Earlier note/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Visit note' }))
    expect(open).toHaveBeenCalledExactlyOnceWith('active-note')
  })

  it('posts exactly body and same-patient active note IDs and preserves a network-failed draft', async () => {
    vi.mocked(api.listNotes).mockResolvedValue([
      makeNote(),
      makeNote({
        id: 'wrong-patient-note',
        patient_id: 'wrong-patient',
        content: 'Other patient note',
      }),
    ])
    const create = vi
      .spyOn(api, 'createComment')
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Connection lost.'))
      .mockResolvedValue(makeComment('posted', { is_unread: false }))
    const onSaved = vi.fn()
    const { client } = renderFeature(
      <CommentForm
        patientId={patientId}
        actorId={actorId}
        authorName="Sam Rivera"
        onSaved={onSaved}
      />,
    )
    client.setQueryData(patientKeys.summary(patientId), { summary: 'Clinical text' })
    expect(await screen.findByRole('checkbox', { name: /Follow-up visit/ })).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /Other patient note/ })).not.toBeInTheDocument()
    await userEvent.type(
      screen.getByRole('textbox', { name: /^Comment/ }),
      '  Please review this note.  ',
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /Follow-up visit/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }))
    expect(await screen.findByText('Connection lost.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^Comment/ })).toHaveValue(
      '  Please review this note.  ',
    )
    expect(screen.getByRole('checkbox', { name: /Follow-up visit/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create).toHaveBeenLastCalledWith(
      patientId,
      { body: 'Please review this note.', note_ids: [makeNote().id] },
      { actorId },
    )
    expect(onSaved).toHaveBeenCalledWith(makeComment('posted', { is_unread: false }))
    expect(client.getQueryState(patientKeys.summary(patientId))?.isInvalidated).toBe(false)
  })

  it('preserves unchanged deleted references on edit and sends their explicit removal', async () => {
    const comment = makeComment('edit-me', {
      author: { id: actorId, display_name: 'Sam' },
      note_links: [
        { id: 'deleted-note', label: 'Earlier note', url: '/patients/p/notes/n', is_deleted: true },
      ],
    })
    const update = vi.spyOn(api, 'updateComment').mockResolvedValue(comment)
    const { unmount } = renderFeature(
      <CommentForm patientId={patientId} actorId={actorId} comment={comment} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save comment' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        patientId,
        comment.id,
        { body: comment.body, note_ids: ['deleted-note'] },
        { actorId },
      ),
    )
    unmount()
    renderFeature(<CommentForm patientId={patientId} actorId={actorId} comment={comment} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Earlier note/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save comment' }))
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        patientId,
        comment.id,
        { body: comment.body, note_ids: [] },
        { actorId },
      ),
    )
  })

  it('renders forbidden errors and retains a comment draft when ownership changes server-side', async () => {
    const comment = makeComment('forbidden', { author: { id: actorId, display_name: 'Sam' } })
    vi.spyOn(api, 'updateComment').mockRejectedValue(
      new ApiError(403, 'forbidden', 'Only the author can change this record.'),
    )
    renderFeature(<CommentForm patientId={patientId} actorId={actorId} comment={comment} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save comment' }))
    expect(await screen.findByText('Only the author can change this record.')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /^Comment/ })).toHaveValue(comment.body)
  })
})

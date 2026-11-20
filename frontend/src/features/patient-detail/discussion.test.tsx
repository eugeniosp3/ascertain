import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { api, ApiError, type Comment, type Page, type ReadReceipt } from '@/api'
import { patientKeys } from '@/app/query-keys'
import { DiscussionPanel } from './DiscussionPanel'
import { CommentForm } from './CommentForm'
import { CommentItem } from './CommentItem'
import { NoteLinkPicker } from './NoteLinkPicker'
import { useDiscussionRead } from './useDiscussionRead'
import { actorId, otherActor, patientId, patient, makeComment, makeNote } from './test-data'
import { renderFeature } from './test-utils'

function ReadHarness({ comments, active }: { comments: Comment[]; active: boolean }) {
  const read = useDiscussionRead(patientId, actorId, active, comments)
  return (
    <>
      <p data-testid="snapshot">{[...read.newIds].join(',')}</p>
      {read.readError && <button onClick={read.retryRead}>Retry read</button>}
    </>
  )
}

function page(items: Comment[], number = 1, total = items.length): Page<Comment> {
  return { items, total, page: number, page_size: 10 }
}

beforeEach(() => {
  vi.spyOn(api, 'listNotes').mockResolvedValue([])
  vi.spyOn(api, 'listUsers').mockResolvedValue([
    { id: actorId, display_name: 'Sam Rivera' },
    { id: otherActor, display_name: 'Alex Morgan' },
  ])
})

describe('displayed discussion acknowledgments', () => {
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
  it('does not overwrite newer unread counts with a delayed receipt snapshot', async () => {
    let complete!: (receipt: ReadReceipt) => void
    const mark = vi.spyOn(api, 'markCommentsRead').mockImplementation(
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
    client.setQueryData(patientKeys.comments(patientId, actorId, { page: 1 }), page([first, later]))
    await act(async () => {
      complete({
        patient_id: patientId,
        read_comment_ids: ['first-seen'],
        unread_comments_count: 0,
      })
    })
    expect(client.getQueryData(patientKeys.detail(patientId, actorId))).toMatchObject({
      unread_comments_count: 3,
    })
    expect(client.getQueryState(patientKeys.detail(patientId, actorId))?.isInvalidated).toBe(true)
    const cached = client.getQueryData<Page<Comment>>(
      patientKeys.comments(patientId, actorId, { page: 1 }),
    )
    expect(cached?.items.find((comment) => comment.id === 'first-seen')?.is_unread).toBe(false)
    expect(cached?.items.find((comment) => comment.id === 'new-arrival')?.is_unread).toBe(true)
  })
  it('waits while the document is hidden and acknowledges after it becomes visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const mark = vi.spyOn(api, 'markCommentsRead').mockResolvedValue({
      patient_id: patientId,
      read_comment_ids: ['visible'],
      unread_comments_count: 0,
    })
    renderFeature(<ReadHarness comments={[makeComment('visible')]} active />)
    expect(mark).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() =>
      expect(mark).toHaveBeenCalledExactlyOnceWith(patientId, ['visible'], { actorId }),
    )
  })

  it('waits for the visible tab, excludes own and other-patient comments, and snapshots observed IDs', async () => {
    const mark = vi.spyOn(api, 'markCommentsRead').mockResolvedValue({
      patient_id: patientId,
      read_comment_ids: ['seen'],
      unread_comments_count: 2,
    })
    const comments = [
      makeComment('seen'),
      makeComment('own', { author: { id: actorId, display_name: 'Sam' } }),
      makeComment('other-patient', { patient_id: 'another-patient' }),
    ]
    const { client, rerender } = renderFeature(<ReadHarness comments={comments} active={false} />)
    client.setQueryData(patientKeys.detail(patientId, otherActor), {
      ...patient,
      unread_comments_count: 7,
    })
    client.setQueryData(patientKeys.comments(patientId, actorId, { page: 1 }), page(comments))
    client.setQueryData(patientKeys.summary(patientId), { summary: 'Clinical summary' })
    expect(mark).not.toHaveBeenCalled()
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={comments} active />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(mark).toHaveBeenCalledExactlyOnceWith(patientId, ['seen'], { actorId }),
    )
    await waitFor(() =>
      expect(
        client.getQueryData<Page<Comment>>(patientKeys.comments(patientId, actorId, { page: 1 }))
          ?.items[0]?.is_unread,
      ).toBe(false),
    )
    expect(screen.getByTestId('snapshot')).toHaveTextContent('seen')
    expect(client.getQueryData(patientKeys.detail(patientId, otherActor))).toMatchObject({
      unread_comments_count: 7,
    })
    expect(client.getQueryState(patientKeys.detail(patientId, otherActor))?.isInvalidated).toBe(
      false,
    )
    expect(client.getQueryState(patientKeys.summary(patientId))?.isInvalidated).toBe(false)
  })

  it('does not include a later arrival in an in-flight request or acknowledge after leaving Discussion', async () => {
    let complete!: (receipt: ReadReceipt) => void
    const mark = vi.spyOn(api, 'markCommentsRead').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const first = makeComment('first')
    const later = makeComment('later')
    const { client, rerender } = renderFeature(<ReadHarness comments={[first]} active />)
    await waitFor(() => expect(mark).toHaveBeenCalledWith(patientId, ['first'], { actorId }))
    rerender(
      <QueryClientProvider client={client}>
        <ReadHarness comments={[first, later]} active={false} />
      </QueryClientProvider>,
    )
    await act(async () => {
      complete({ patient_id: patientId, read_comment_ids: ['first'], unread_comments_count: 1 })
    })
    expect(mark).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('snapshot')).not.toHaveTextContent('later')
  })

  it('keeps unread state on failure, retries the exact snapshot, and avoids an invalidation loop', async () => {
    const comment = makeComment('failed')
    const mark = vi
      .spyOn(api, 'markCommentsRead')
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Offline.'))
      .mockResolvedValue({
        patient_id: patientId,
        read_comment_ids: ['failed'],
        unread_comments_count: 0,
      })
    const { client } = renderFeature(<ReadHarness comments={[comment]} active />)
    client.setQueryData(patientKeys.detail(patientId, actorId), patient)
    await screen.findByRole('button', { name: 'Retry read' })
    expect(client.getQueryData(patientKeys.detail(patientId, actorId))).toMatchObject({
      unread_comments_count: 1,
    })
    expect(mark).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Retry read' }))
    await waitFor(() =>
      expect(client.getQueryState(patientKeys.detail(patientId, actorId))?.isInvalidated).toBe(
        true,
      ),
    )
    expect(client.getQueryData(patientKeys.detail(patientId, actorId))).toMatchObject({
      unread_comments_count: 1,
    })
    expect(mark).toHaveBeenNthCalledWith(2, patientId, ['failed'], { actorId })
    expect(mark).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('snapshot')).toHaveTextContent('failed')
  })

  it('acknowledges pages separately and retains New labels after server acknowledgment', async () => {
    let firstRead = false
    let secondRead = false
    vi.spyOn(api, 'listComments').mockImplementation(async (_id, params) =>
      params.page === 2
        ? page([makeComment('page-two', { is_unread: !secondRead })], 2, 11)
        : page([makeComment('page-one', { is_unread: !firstRead })], 1, 11),
    )
    const mark = vi.spyOn(api, 'markCommentsRead').mockImplementation(async (_id, ids) => {
      if (ids.includes('page-one')) firstRead = true
      if (ids.includes('page-two')) secondRead = true
      return {
        patient_id: patientId,
        read_comment_ids: ids,
        unread_comments_count: secondRead ? 0 : 1,
      }
    })
    renderFeature(
      <DiscussionPanel patientId={patientId} actorId={actorId} active onNoteOpen={vi.fn()} />,
    )
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1))
    expect(mark).toHaveBeenCalledWith(patientId, ['page-one'], { actorId })
    expect(within(screen.getByRole('list', { name: 'Comments' })).getByText('New')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(2))
    expect(mark).toHaveBeenNthCalledWith(2, patientId, ['page-two'], { actorId })
    expect(within(screen.getByRole('list', { name: 'Comments' })).getByText('New')).toBeVisible()
  })

  it('resets visit labels and drafts when actor changes and keeps a late receipt scoped to its actor', async () => {
    let complete!: (receipt: ReadReceipt) => void
    vi.spyOn(api, 'listComments').mockImplementation(async (_id, _params, ctx) =>
      page([makeComment('actor-a-new', { is_unread: ctx?.actorId === actorId })]),
    )
    const mark = vi.spyOn(api, 'markCommentsRead').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const { client, rerender } = renderFeature(
      <DiscussionPanel patientId={patientId} actorId={actorId} active onNoteOpen={vi.fn()} />,
    )
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1))
    await userEvent.type(screen.getByRole('textbox', { name: /^Comment/ }), 'Actor A draft')
    client.setQueryData(patientKeys.detail(patientId, otherActor), {
      ...patient,
      unread_comments_count: 8,
    })
    rerender(
      <QueryClientProvider client={client}>
        <DiscussionPanel patientId={patientId} actorId={otherActor} active onNoteOpen={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('textbox', { name: /^Comment/ })).toHaveValue('')
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Comments' })).queryByText('New'),
      ).not.toBeInTheDocument(),
    )
    await act(async () => {
      complete({
        patient_id: patientId,
        read_comment_ids: ['actor-a-new'],
        unread_comments_count: 0,
      })
    })
    expect(mark).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(patientKeys.detail(patientId, otherActor))).toMatchObject({
      unread_comments_count: 8,
    })
  })
})

describe('comment forms and note references', () => {
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
    const { client } = renderFeature(
      <CommentForm patientId={patientId} actorId={actorId} authorName="Sam Rivera" />,
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

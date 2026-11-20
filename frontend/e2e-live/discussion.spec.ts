import type { Request } from '@playwright/test'
import { test, expect } from './fixtures'
import type { Comment, CommentPage } from './api'
import {
  apiRequestMatches,
  browserJSON,
  closeWorkspace,
  confirmDeletion,
  directory,
  expectNotificationBadge,
  openPatient,
  patientRow,
  refreshDiscussion,
  waitForAPI,
} from './ui'

test('two real actors retain independent unread state through UI posting, Notes, bounded reads, reload, edit and delete', async ({
  page,
  live,
}) => {
  const {
    api,
    actors: [author, viewer],
  } = live
  const patient = await api.createPatient('Discussion', author.id)
  const path = `/patients/${patient.id}/comments`
  const receipts: Request[] = []
  page.on('request', (request) => {
    if (apiRequestMatches(api, request, 'POST', `${path}/read`)) receipts.push(request)
  })
  const body = `Live author message ${api.token}`
  await openPatient(page, api, patient.id, 'discussion')
  const form = page.getByRole('form', { name: 'Add a comment', exact: true })
  await form.getByLabel('Comment', { exact: false }).fill(body)
  const posted = waitForAPI(page, api, 'POST', path)
  await form.getByRole('button', { name: 'Post comment', exact: true }).click()
  const comment = await browserJSON<Comment>(await posted, 201)
  expect(comment.author.id).toBe(author.id)
  expect(comment.is_unread).toBe(false)
  await refreshDiscussion(page, api, patient.id, author)
  const comments = page.getByRole('list', { name: 'Comments', exact: true })
  const authored = comments.getByRole('listitem').filter({ hasText: body })
  await expect(authored).toContainText(author.display_name)
  await expect(authored.getByText('New comment during this visit', { exact: true })).toHaveCount(0)
  expect((await api.comments(patient.id, author.id)).items[0]!.is_unread).toBe(false)
  await closeWorkspace(page)

  // This API fixture predates B's read. It must stay unread for A when B acknowledges A.
  const watermarkControl = await api.createComment(
    patient.id,
    viewer.id,
    `Independent viewer watermark fixture ${api.token}`,
  )
  expect(
    (await api.comments(patient.id, author.id)).items.find(
      (item) => item.id === watermarkControl.id,
    )!.is_unread,
  ).toBe(true)

  const queueResponse = waitForAPI(page, api, 'GET', '/patients', viewer.id)
  const queue = await directory(page, api, viewer, `/notifications?q=${api.token}`)
  const queueQuery = new URL((await queueResponse).url()).searchParams
  expect(queueQuery.get('unread_only')).toBe('true')
  expect(queueQuery.has('has_unread_comments')).toBe(false)
  expect(queue.items.map((item) => item.id)).toEqual([patient.id])
  expect(queue.items[0]!.unread_comments_count).toBe(1)
  await expectNotificationBadge(page, api, viewer)
  const row = patientRow(page, patient.id)
  await expect(row.getByText('New', { exact: true })).toBeVisible()
  await row.locator('a[data-open-tab="overview"]').click()
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
    'data-state',
    'active',
  )
  await page.getByRole('tab', { name: /^Notes/ }).click()
  await expect(
    page.getByRole('heading', { name: 'No clinical notes yet', exact: true }),
  ).toBeVisible()
  expect((await api.comments(patient.id, viewer.id)).items[0]!.is_unread).toBe(true)
  expect((await api.patient(patient.id, viewer.id)).unread_comments_count).toBe(1)
  expect(
    receipts.filter((request) => request.headers()['x-demo-user-id'] === viewer.id),
  ).toHaveLength(0)
  await closeWorkspace(page)

  const firstPage = waitForAPI(page, api, 'GET', path, viewer.id)
  const read = waitForAPI(page, api, 'POST', `${path}/read`, viewer.id)
  await patientRow(page, patient.id).locator('a[data-open-tab="discussion"]').click()
  const snapshot = await browserJSON<CommentPage>(await firstPage)
  expect(snapshot.items[0]!.is_unread).toBe(true)
  expect(snapshot.items.find((item) => item.id === watermarkControl.id)!.is_unread).toBe(false)
  const readResponse = await read
  const receipt = await browserJSON<{ patient_id: string; last_read_at: string }>(readResponse)
  expect(readResponse.request().postDataJSON()).toEqual({ through: snapshot.read_through })
  expect(receipt.patient_id).toBe(patient.id)
  expect(new Date(receipt.last_read_at).getTime()).toBe(new Date(snapshot.read_through).getTime())
  await expect(authored.getByText('New comment during this visit', { exact: true })).toBeVisible()
  await expect(authored.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0)
  await expect(authored.getByRole('button', { name: 'Delete comment', exact: true })).toHaveCount(0)
  expect((await api.comments(patient.id, viewer.id)).items[0]!.is_unread).toBe(false)
  expect((await api.patient(patient.id, viewer.id)).unread_comments_count).toBe(0)
  expect(
    (await api.comments(patient.id, author.id)).items.find(
      (item) => item.id === watermarkControl.id,
    )!.is_unread,
  ).toBe(true)

  // Close before reload so the disappearing notification row must restore a valid focus target.
  await closeWorkspace(page)
  await expect(patientRow(page, patient.id)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeFocused()
  await expectNotificationBadge(page, api, viewer)
  await openPatient(page, api, patient.id, 'discussion')
  await page.reload()
  await expect(authored).toBeVisible()
  await expect(authored.getByText('New comment during this visit', { exact: true })).toHaveCount(0)
  expect((await api.comments(patient.id, viewer.id)).items[0]!.is_unread).toBe(false)

  const replyBody = `Live viewer reply ${api.token}`
  await form.getByLabel('Comment', { exact: false }).fill(replyBody)
  const replyResponse = waitForAPI(page, api, 'POST', path, viewer.id)
  await form.getByRole('button', { name: 'Post comment', exact: true }).click()
  const reply = await browserJSON<Comment>(await replyResponse, 201)
  expect(reply.is_unread).toBe(false)
  await refreshDiscussion(page, api, patient.id, viewer)
  const ownReply = comments.getByRole('listitem').filter({ hasText: replyBody })
  await expect(ownReply).toBeVisible()
  await expect(ownReply.getByText('New comment during this visit', { exact: true })).toHaveCount(0)
  const authorView = await api.comments(patient.id, author.id)
  expect(authorView.items.find((item) => item.id === comment.id)!.is_unread).toBe(false)
  expect(authorView.items.find((item) => item.id === reply.id)!.is_unread).toBe(true)
  await closeWorkspace(page)

  await directory(page, api, author)
  await openPatient(page, api, patient.id, 'discussion')
  await expect(authored.getByRole('button', { name: 'Edit comment', exact: true })).toBeVisible()
  await authored.getByRole('button', { name: 'Edit comment', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit comment', exact: true })
  const revisedBody = `${body} revised`
  await edit.getByLabel('Comment', { exact: false }).fill(revisedBody)
  const editedResponse = waitForAPI(page, api, 'PUT', `${path}/${comment.id}`, author.id)
  await edit.getByRole('button', { name: 'Save comment', exact: true }).click()
  const edited = await browserJSON<Comment>(await editedResponse)
  expect(edited.author.id).toBe(author.id)
  expect(edited.created_at).toBe(comment.created_at)
  const viewerAfterEdit = await api.comments(patient.id, viewer.id)
  expect(viewerAfterEdit.items.every((item) => !item.is_unread)).toBe(true)
  const revised = comments.getByRole('listitem').filter({ hasText: revisedBody })
  await expect(revised).toContainText('Edited')
  await revised.getByRole('button', { name: 'Delete comment', exact: true }).click()
  const deleted = waitForAPI(page, api, 'DELETE', `${path}/${comment.id}`, author.id)
  await confirmDeletion(page, 'Delete comment')
  expect((await deleted).status()).toBe(204)
  await expect(revised).toHaveCount(0)
  expect((await api.comments(patient.id, author.id)).items.map((item) => item.id)).toEqual([
    watermarkControl.id,
    reply.id,
  ])
})

test('cursor pages acknowledge only displayed prefixes, survive earlier deletion and exclude arrivals until Refresh', async ({
  page,
  live,
}) => {
  const {
    api,
    actors: [author, viewer],
  } = live
  const patient = await api.createPatient('Cursor', author.id)
  const path = `/patients/${patient.id}/comments`
  const receipts: Request[] = []
  page.on('request', (request) => {
    if (
      apiRequestMatches(api, request, 'POST', `${path}/read`) &&
      request.headers()['x-demo-user-id'] === viewer.id
    )
      receipts.push(request)
  })
  // API setup is deliberately separate from the UI write assertions in the other journey.
  const seeded: Comment[] = []
  for (let index = 0; index < 13; index++) {
    seeded.push(
      await api.createComment(patient.id, author.id, `Cursor fixture ${index} ${api.token}`),
    )
  }
  expect((await api.comments(patient.id, viewer.id)).total).toBe(seeded.length)
  await directory(page, api, viewer)
  const firstResponse = waitForAPI(page, api, 'GET', path, viewer.id)
  const firstRead = waitForAPI(page, api, 'POST', `${path}/read`, viewer.id)
  await openPatient(page, api, patient.id, 'discussion')
  const first = await browserJSON<CommentPage>(await firstResponse)
  expect(first.page).toBe(1)
  expect(first.page_size).toBe(10)
  expect(first.items.map((item) => item.id)).toEqual(seeded.slice(0, 10).map((item) => item.id))
  expect(first.next_cursor).toEqual(expect.any(String))
  const displayed = page.getByRole('list', { name: 'Comments', exact: true }).locator(':scope > li')
  await expect(displayed).toHaveCount(10)
  const firstAck = await firstRead
  expect(firstAck.status()).toBe(200)
  expect(firstAck.request().postDataJSON()).toEqual({ through: first.read_through })
  const afterFirst = await api.comments(patient.id, viewer.id)
  expect(afterFirst.items.slice(0, 10).every((item) => !item.is_unread)).toBe(true)
  expect(afterFirst.items.slice(10).every((item) => item.is_unread)).toBe(true)
  expect((await api.patient(patient.id, viewer.id)).unread_comments_count).toBe(3)

  const earlier = await api.response('DELETE', `${path}/${seeded[0]!.id}`, author.id)
  expect(earlier.status()).toBe(204)
  const arrival = await api.createComment(
    patient.id,
    author.id,
    `Arrived after snapshot ${api.token}`,
  )
  const nextResponse = waitForAPI(page, api, 'GET', path, viewer.id)
  const nextRead = waitForAPI(page, api, 'POST', `${path}/read`, viewer.id)
  await page
    .getByRole('region', { name: 'Team discussion' })
    .getByRole('button', { name: 'Next', exact: true })
    .click()
  const nextReply = await nextResponse
  const query = new URL(nextReply.url()).searchParams
  expect(query.get('cursor')).toBe(first.next_cursor)
  expect(query.get('page')).not.toBe('2')
  const next = await browserJSON<CommentPage>(nextReply)
  expect(next.items.map((item) => item.id)).toEqual(seeded.slice(10).map((item) => item.id))
  expect(next.next_cursor).toBeNull()
  await expect(displayed).toHaveCount(3)
  await expect(page.getByText(arrival.body, { exact: true })).toHaveCount(0)
  const nextAck = await nextRead
  expect(nextAck.status()).toBe(200)
  expect(nextAck.request().postDataJSON()).toEqual({ through: next.read_through })
  const unread = (await api.comments(patient.id, viewer.id)).items.filter((item) => item.is_unread)
  expect(unread.map((item) => item.id)).toEqual([arrival.id])
  expect((await api.patient(patient.id, viewer.id)).unread_comments_count).toBe(1)

  const refreshedResponse = waitForAPI(page, api, 'GET', path, viewer.id)
  await page
    .getByRole('region', { name: 'Team discussion' })
    .getByRole('button', { name: /^Refresh(?: discussion)?$/i })
    .click()
  const refreshed = await browserJSON<CommentPage>(await refreshedResponse)
  expect(refreshed.total).toBe(13)
  expect(refreshed.page).toBe(1)
  expect(refreshed.next_cursor).toEqual(expect.any(String))
  expect(refreshed.items.every((item) => !item.is_unread)).toBe(true)
  await expect(displayed).toHaveCount(10)
  // Refresh returns an earlier prefix already covered by this visit's later acknowledgement.
  // The unseen arrival must remain unread until Next actually displays it.
  expect(receipts).toHaveLength(2)
  expect(
    (await api.comments(patient.id, viewer.id)).items
      .filter((item) => item.is_unread)
      .map((item) => item.id),
  ).toEqual([arrival.id])
  const refreshedNext = waitForAPI(page, api, 'GET', path, viewer.id)
  const arrivalRead = waitForAPI(page, api, 'POST', `${path}/read`, viewer.id)
  await page
    .getByRole('region', { name: 'Team discussion' })
    .getByRole('button', { name: 'Next', exact: true })
    .click()
  const refreshedLast = await browserJSON<CommentPage>(await refreshedNext)
  expect(refreshedLast.items.some((item) => item.id === arrival.id)).toBe(true)
  await expect(page.getByText(arrival.body, { exact: true })).toBeVisible()
  const arrivalAck = await arrivalRead
  expect(arrivalAck.status()).toBe(200)
  expect(arrivalAck.request().postDataJSON()).toEqual({ through: refreshedLast.read_through })
  expect(receipts).toHaveLength(3)
  expect((await api.comments(patient.id, viewer.id)).items.every((item) => !item.is_unread)).toBe(
    true,
  )
  expect((await api.patient(patient.id, viewer.id)).unread_comments_count).toBe(0)
})

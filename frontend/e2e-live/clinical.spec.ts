import { test, expect } from './fixtures'
import type { Comment, Note } from './api'
import {
  browserJSON,
  confirmDeletion,
  expectAPIError,
  openPatient,
  refreshDiscussion,
  waitForAPI,
} from './ui'

test('UI clinical timestamp, stored author, summary, direct note reload, linked discussion and tombstone refresh', async ({
  page,
  live,
}) => {
  const { api, actors } = live
  const actor = actors[0]
  const patient = await api.createPatient('Clinical', actor.id)
  const content = `Live clinical finding ${api.token} <b>literal text</b>`
  const discussion = `Live nonclinical message ${api.token}`
  await openPatient(page, api, patient.id, 'notes')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const form = page.getByRole('form', { name: 'Add clinical note', exact: true })
  await form.getByLabel('Clinical date and time', { exact: false }).fill('2020-01-02T03:04')
  await form.getByLabel('Note', { exact: false }).fill(content)
  const savedResponse = waitForAPI(page, api, 'POST', `/patients/${patient.id}/notes`)
  await form.getByRole('button', { name: 'Save note', exact: true }).click()
  const response = await savedResponse
  const note = await browserJSON<Note>(response, 201)
  const noteWrite = response.request().postDataJSON() as { timestamp: string; content: string }
  expect(Object.keys(noteWrite).sort()).toEqual(['content', 'timestamp'])
  expect(noteWrite.timestamp).toBe('2020-01-02T08:04:00.000Z')
  expect(noteWrite.content === content, 'Browser sent the entered clinical note').toBe(true)
  expect(note.author.id).toBe(actor.id)
  expect(new Date(note.timestamp).toISOString()).toBe('2020-01-02T08:04:00.000Z')
  const stored = await api.json<Note>('GET', `/patients/${patient.id}/notes/${note.id}`, actor.id)
  expect(stored.content === content, 'Saved clinical content').toBe(true)
  expect(stored.author.id).toBe(actor.id)
  await expect(page.getByRole('article')).toContainText(content)
  await expect(page.getByRole('article').locator('b')).toHaveCount(0)
  await expect(page).toHaveURL((url) =>
    url.pathname.endsWith(`/patients/${patient.id}/notes/${note.id}`),
  )
  const noteURL = page.url()
  await page.reload()
  await expect(page.getByRole('article')).toContainText(content)
  await expect(page.getByRole('article').locator('time')).toHaveAttribute(
    'datetime',
    note.timestamp,
  )
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Patient summary' })).toContainText(content)
  const summaryBefore = await api.json<{ summary: string }>(
    'GET',
    `/patients/${patient.id}/summary`,
    actor.id,
  )
  expect(summaryBefore.summary.includes(content)).toBe(true)

  await page.getByRole('tab', { name: /^Discussion/ }).click()
  const commentForm = page.getByRole('form', { name: 'Add a comment', exact: true })
  await commentForm.getByLabel('Comment', { exact: false }).fill(discussion)
  await commentForm.getByRole('checkbox').check()
  const commentResponse = waitForAPI(page, api, 'POST', `/patients/${patient.id}/comments`)
  await commentForm.getByRole('button', { name: 'Post comment', exact: true }).click()
  const comment = await browserJSON<Comment>(await commentResponse, 201)
  expect(comment.note_links.map((link) => link.id)).toEqual([note.id])
  await refreshDiscussion(page, api, patient.id, actor)
  const item = page
    .getByRole('list', { name: 'Comments', exact: true })
    .getByRole('listitem')
    .filter({ hasText: discussion })
  await expect(item).toBeVisible()
  await item.getByRole('list', { name: 'Linked clinical notes' }).getByRole('button').click()
  await expect(page.getByRole('article')).toContainText(content)
  await expect(page).toHaveURL((url) => url.pathname.endsWith(`/notes/${note.id}`))
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  const deletion = waitForAPI(page, api, 'DELETE', `/patients/${patient.id}/notes/${note.id}`)
  await confirmDeletion(page, 'Delete note')
  expect((await deletion).status()).toBe(204)
  await expectAPIError(api, 'GET', `/patients/${patient.id}/notes/${note.id}`, actor.id, 410)
  await expect(
    page.getByRole('heading', { name: 'No clinical notes yet', exact: true }),
  ).toBeVisible()
  expect((await api.patient(patient.id, actor.id)).notes_count).toBe(0)
  expect(await api.json<Note[]>('GET', `/patients/${patient.id}/notes`, actor.id)).toHaveLength(0)

  await page.getByRole('tab', { name: /^Discussion/ }).click()
  await expect(item.getByRole('list', { name: 'Linked clinical notes' })).toContainText(
    'Deleted note',
  )
  await expect(
    item.getByRole('list', { name: 'Linked clinical notes' }).getByRole('button'),
  ).toHaveCount(0)
  const linked = (await api.comments(patient.id, actor.id)).items.find(
    (entry) => entry.id === comment.id,
  )!
  expect(linked.note_links[0]!.is_deleted).toBe(true)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Patient summary' })).not.toContainText(content)
  const summaryAfter = await api.json<{ summary: string }>(
    'GET',
    `/patients/${patient.id}/summary`,
    actor.id,
  )
  expect(summaryAfter.summary.includes(content)).toBe(false)
  expect(summaryAfter.summary.includes(discussion)).toBe(false)
  await page.goto(noteURL)
  await expect(
    page.getByRole('heading', { name: 'This note was deleted', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'This note was deleted', exact: true }),
  ).toBeVisible()
})

test('real API rejects invalid profiles, cross-patient note links and another author’s mutations', async ({
  page,
  live,
}) => {
  const {
    api,
    actors: [author, other],
  } = live
  const input = api.patientInput('Invalid')
  const invalid = await api.response('POST', '/patients', author.id, {
    ...input,
    state: 'NEW YORK',
    phone: '123',
  })
  expect(invalid.status()).toBe(422)
  const validation = (await invalid.json()) as {
    error: { code: string; fields: { path: (string | number)[] }[] }
  }
  expect(validation.error.code).toBe('validation_error')
  expect(validation.error.fields.some((field) => field.path.includes('state'))).toBe(true)
  expect(validation.error.fields.some((field) => field.path.includes('phone'))).toBe(true)
  const noInvalidPatient = await api.json<{ total: number }>(
    'GET',
    `/patients?q=${encodeURIComponent(input.last_name)}`,
    author.id,
  )
  expect(noInvalidPatient.total).toBe(0)

  const patient = await api.createPatient('Errors', author.id)
  const otherPatient = await api.createPatient('WrongParent', author.id)
  const note = await api.json<Note>(
    'POST',
    `/patients/${patient.id}/notes`,
    author.id,
    {
      timestamp: '2020-01-01T00:00:00Z',
      content: `Protected own clinical note ${api.token}`,
    },
    201,
  )
  const comment = await api.createComment(
    patient.id,
    author.id,
    `Protected own discussion ${api.token}`,
  )
  await expectAPIError(api, 'GET', `/patients/${otherPatient.id}/notes/${note.id}`, author.id, 404)
  await expectAPIError(api, 'POST', `/patients/${otherPatient.id}/comments`, author.id, 422, {
    body: 'Invalid cross-patient link',
    note_ids: [note.id],
  })
  await expectAPIError(
    api,
    'PUT',
    `/patients/${patient.id}/comments/${comment.id}`,
    other.id,
    403,
    { body: 'Forbidden edit', note_ids: [] },
  )
  await expectAPIError(
    api,
    'DELETE',
    `/patients/${patient.id}/comments/${comment.id}`,
    other.id,
    403,
  )
  await expectAPIError(api, 'DELETE', `/patients/${patient.id}/notes/${note.id}`, other.id, 403)
  const after = await api.patient(patient.id, author.id)
  expect(after.comments_count).toBe(1)
  expect(after.notes_count).toBe(1)
  expect((await api.comments(patient.id, author.id)).items[0]!.body === comment.body).toBe(true)

  await page.goto(api.uiURL(`/patients/${otherPatient.id}/notes/${note.id}`))
  await expect(page.getByRole('heading', { name: 'Note not found', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Note not found', exact: true })).toBeVisible()
  expect((await api.patient(otherPatient.id, author.id)).comments_count).toBe(0)
})

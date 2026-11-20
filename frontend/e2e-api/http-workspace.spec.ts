import {
  actor,
  detail,
  emptyWrite,
  expect,
  failure,
  noteId,
  notePath,
  openPatient,
  patientPath,
  selectActor,
  test,
} from './contract-fixture'
import type { PatientWrite } from '../src/api/types'

test('explicit API actor gates domain HTTP; list queries and global counts remain independent', async ({
  page,
  contract,
}) => {
  contract.handler = (call) =>
    call.method === 'GET' && call.path === '/patients' && call.query.q === 'HTTP-0001'
      ? { json: { items: [contract.patient], total: 51, page: 2, page_size: 50 } }
      : undefined
  await page.goto(
    '/patients?q=HTTP-0001&status=active&sort_by=comments_count&order=desc&page=2&page_size=50',
  )
  await expect(page.getByRole('heading', { name: 'Choose a demo user' })).toBeVisible()
  expect(contract.requests.length).toBeGreaterThan(0)
  // React development StrictMode may cancel and repeat the initial discovery.
  expect(
    contract.requests.every((call) => call.path === '/users' && call.actorId === undefined),
  ).toBe(true)
  await expect(page.getByText('Demo workspace', { exact: false })).toHaveCount(0)
  await selectActor(page, contract)
  await expect(page.getByRole('status')).toHaveText('51 patients matching your filters')
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  expect(contract.matching('GET', '/patients')[0]?.query).toEqual({
    q: 'HTTP-0001',
    status: 'active',
    sort_by: 'comments_count',
    order: 'desc',
    page: '2',
    page_size: '50',
  })
  expect(
    contract.requests.filter(
      (call) => call.path.includes('/notes') || call.path.includes('/comments'),
    ),
  ).toEqual([])
  await page.getByRole('link', { name: 'Notifications, 37 unread comments', exact: true }).click()
  await expect(
    page.getByText('37 unread comments across 8 patients', { exact: true }),
  ).toBeVisible()
  await expect
    .poll(() => contract.matching('GET', '/patients').at(-1)?.query)
    .toEqual({
      sort_by: 'name',
      order: 'asc',
      page: '1',
      page_size: '20',
      has_unread_comments: 'true',
    })
  // This binding frontend spelling intentionally exposes the backend unread_only gap.
  await page.getByRole('searchbox', { name: 'Search patients' }).fill('no HTTP match')
  await expect(page.getByRole('heading', { name: 'No matching patients' })).toBeVisible()
  await expect(
    page.getByText('37 unread comments across 8 patients', { exact: true }),
  ).toBeVisible()
  expect(contract.matching('GET', '/notifications/summary')).toHaveLength(1)

  await page.goto(notePath)
  await expect(page.getByRole('dialog', { name: 'HTTP Patient', exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toContainText('Literal <b>response</b>')
  await expect(page.getByRole('article').locator('b')).toHaveCount(0)
  expect(contract.matching('GET', notePath).length).toBeGreaterThan(0)
  expect(contract.matching('GET', patientPath).length).toBeGreaterThan(0)
})

test('patient POST preserves a nested 422 draft and network failure; PUT is complete and refreshed GET wins', async ({
  page,
  contract,
}) => {
  let posts = 0
  let releaseWrite = () => {}
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  contract.handler = async (call) => {
    if (call.method === 'POST' && call.path === '/patients') {
      posts++
      expect(call.body).toEqual({
        ...emptyWrite,
        last_name: 'Created',
        conditions: [
          { code: null, label: posts === 1 ? 'Initial condition' : 'Revised condition' },
        ],
      })
      if (posts === 1)
        return {
          status: 422,
          json: {
            error: {
              code: 'validation_error',
              message: 'Request validation failed.',
              fields: [
                {
                  path: ['body', 'conditions', 0, 'label'],
                  code: 'invalid',
                  message: 'Choose a more specific condition.',
                },
              ],
            },
          },
        }
      if (posts === 2) {
        await writeGate
        return { abort: true }
      }
    }
    if (call.method === 'PUT' && call.path === patientPath) {
      expect(call.body).toEqual({ ...emptyWrite, last_name: 'Updated', conditions: [] })
      // The refetch is a newer server snapshot than the write response.
      contract.patient = detail({
        last_name: 'Refreshed',
        name: 'HTTP Refreshed',
        city: 'Newer GET city',
      })
      return { json: detail({ ...(call.body as PatientWrite), name: 'HTTP Updated' }) }
    }
    return undefined
  }
  await page.goto('/patients/new')
  await selectActor(page, contract)
  const form = page.getByRole('form', { name: 'Add patient', exact: true })
  await form.getByLabel('First name', { exact: false }).fill('HTTP')
  await form.getByLabel('Last name', { exact: false }).fill('Created')
  await form.getByLabel('Date of birth', { exact: false }).fill(emptyWrite.date_of_birth)
  await form.getByRole('button', { name: 'Add condition', exact: true }).click()
  const label = form.getByLabel('Condition 1 label', { exact: false })
  await label.fill('Initial condition')
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()
  await expect(label).toHaveAttribute('aria-invalid', 'true')
  await expect(label).toHaveAccessibleDescription('Choose a more specific condition.')
  await expect(label).toHaveValue('Initial condition')
  await expect(form.getByLabel('First name', { exact: false })).toHaveValue('HTTP')
  expect(posts).toBe(1)
  await label.fill('Revised condition')
  await expect(label).toHaveAttribute('aria-invalid', 'false')
  try {
    await form.getByRole('button', { name: 'Add patient', exact: true }).click()
    await expect(form.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
    await expect.poll(() => posts).toBe(2)
    // A second native form submission during the pending request must be ignored.
    await form.evaluate((element: HTMLFormElement) => element.requestSubmit())
    expect(posts).toBe(2)
  } finally {
    releaseWrite()
  }
  await expect(form.getByRole('alert')).toContainText(
    'Unable to reach the service. Check your connection.',
  )
  await expect(label).toHaveValue('Revised condition')
  await expect(form.getByRole('button', { name: 'Add patient', exact: true })).toBeEnabled()
  expect(posts).toBe(2)
  await form.getByRole('button', { name: 'Add patient', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'HTTP Created', exact: true })).toBeVisible()
  expect(posts).toBe(3)
  await page.getByRole('button', { name: 'Edit patient', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit patient', exact: true })
  await edit.getByLabel('Last name', { exact: false }).fill('Updated')
  await edit.getByRole('button', { name: 'Remove condition 1', exact: true }).click()
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'HTTP Refreshed', exact: true })).toBeVisible()
  await expect(page.getByText('Newer GET city', { exact: false })).toBeVisible()
  expect(contract.matching('PUT', patientPath)).toHaveLength(1)
})

test('note ISO writes, observed comment IDs, linked notes and empty 204 tombstone responses', async ({
  page,
  contract,
}) => {
  await openPatient(page, contract, `${patientPath}?tab=notes`)
  expect(contract.matching('POST', `${patientPath}/comments/read`)).toHaveLength(0)
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const noteForm = page.getByRole('form', { name: 'Add clinical note', exact: true })
  await noteForm.getByLabel('Clinical date and time', { exact: false }).fill('2026-11-18T10:15')
  await noteForm.getByLabel('Note', { exact: false }).fill('HTTP created clinical note')
  await noteForm.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('HTTP created clinical note')
  expect(contract.matching('POST', `${patientPath}/notes`).map((call) => call.body)).toEqual([
    { timestamp: '2026-11-18T15:15:00.000Z', content: 'HTTP created clinical note' },
  ])
  await page.getByRole('tab', { name: /^Discussion/ }).click()
  const displayedUnread = contract.comments
    .slice(0, 10)
    .filter((c) => c.author.id !== actor.id)
    .map((c) => c.id)
  await expect
    .poll(() => contract.matching('POST', `${patientPath}/comments/read`).map((call) => call.body))
    .toEqual([{ comment_ids: displayedUnread }])
  await expect(
    page.getByRole('list', { name: 'Comments', exact: true }).getByRole('listitem'),
  ).toHaveCount(10)
  expect(contract.comments.slice(10).every((comment) => comment.is_unread)).toBe(true)
  const commentForm = page.getByRole('form', { name: 'Add a comment', exact: true })
  await commentForm.getByLabel('Comment', { exact: false }).fill('HTTP linked discussion')
  await commentForm.getByRole('checkbox', { name: /^HTTP created clinical note/ }).check()
  await commentForm.getByRole('button', { name: 'Post comment', exact: true }).click()
  await expect(page.getByText('HTTP linked discussion', { exact: true })).toBeVisible()
  expect(contract.matching('POST', `${patientPath}/comments`).map((call) => call.body)).toEqual([
    { body: 'HTTP linked discussion', note_ids: [noteId] },
  ])
  await page
    .getByRole('list', { name: 'Linked clinical notes' })
    .getByRole('button', { name: 'HTTP clinical note', exact: true })
    .click()
  await expect(page).toHaveURL((url) => url.pathname === notePath)
  await page.getByRole('button', { name: 'Delete note', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete note', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'No clinical notes yet', exact: true }),
  ).toBeVisible()
  expect(contract.matching('DELETE', notePath)).toHaveLength(1)
  await page.getByRole('tab', { name: /^Discussion/ }).click()
  const links = page.getByRole('list', { name: 'Linked clinical notes' })
  await expect(links).toContainText('Deleted note')
  await expect(links.getByRole('button')).toHaveCount(0)
})

test('404, 503 and network list failures show recovery without fixture fallback or demo banner', async ({
  page,
  contract,
}) => {
  let mode: 'missing' | 'unavailable' | 'network' | 'healthy' = 'missing'
  contract.handler = (call) => {
    if (call.method !== 'GET' || call.path !== '/patients') return undefined
    if (mode === 'missing') return failure(404, 'HTTP collection not found.')
    if (mode === 'unavailable') return failure(503, 'Private backend diagnostic must not render')
    if (mode === 'network') return { abort: true }
    return undefined
  }
  await page.goto('/patients')
  await selectActor(page, contract)
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('HTTP collection not found.')
  expect(contract.matching('GET', '/patients')).toHaveLength(1)
  mode = 'unavailable'
  await alert.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(alert).toContainText('The service is unavailable. Try again.')
  expect(contract.matching('GET', '/patients')).toHaveLength(4)
  mode = 'network'
  await alert.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(alert).toContainText('Unable to reach the service. Check your connection.')
  expect(contract.matching('GET', '/patients')).toHaveLength(7)
  await expect(page.getByText('100 patients', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Demo workspace', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Private backend diagnostic must not render')).toHaveCount(0)
  mode = 'healthy'
  await alert.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('1 patient')
  await expect(page.getByRole('link', { name: 'HTTP Patient', exact: true })).toBeVisible()
})

test('401 and 403 preserve the workspace recovery flow; direct note 404 and 410 have distinct UI', async ({
  page,
  contract,
}) => {
  let status = 401
  contract.handler = (call) =>
    call.method === 'GET' && call.path === patientPath && status !== 200
      ? failure(status, status === 401 ? 'Select an active API user.' : 'This record is forbidden.')
      : undefined
  await openPatient(page, contract)
  await expect(page.getByRole('alert')).toContainText('Select an active API user.')
  const initialDetailRequests = contract.matching('GET', patientPath).length
  expect(initialDetailRequests).toBeGreaterThan(0)
  status = 403
  await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This record is forbidden.')
  expect(contract.matching('GET', patientPath)).toHaveLength(initialDetailRequests + 1)
  status = 200
  await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'HTTP Patient', exact: true })).toBeVisible()
  contract.handler = (call) =>
    call.method === 'GET' && call.path === notePath ? failure(404, 'Note not found.') : undefined
  await page.goto(notePath)
  await expect(page.getByRole('heading', { name: 'Note not found', exact: true })).toBeVisible()
  const missingNoteRequests = contract.matching('GET', notePath).length
  expect(missingNoteRequests).toBeGreaterThan(0)
  contract.handler = (call) =>
    call.method === 'GET' && call.path === notePath
      ? failure(410, 'This note was deleted.')
      : undefined
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'This note was deleted', exact: true }),
  ).toBeVisible()
  expect(contract.matching('GET', notePath).length).toBeGreaterThan(missingNoteRequests)
  await page.getByRole('button', { name: 'Back to Notes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Clinical notes', exact: true })).toBeVisible()
})

test('a failed background profile GET keeps the cached workspace and clinical draft mounted', async ({
  page,
  contract,
}) => {
  // Read receipts are irrelevant to this failure trigger; own comments need none.
  contract.comments = contract.comments.map((comment) => ({
    ...comment,
    author: actor,
    is_unread: false,
  }))
  await openPatient(page, contract, `${patientPath}?tab=notes`)
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const draft = page.getByRole('form', { name: 'Add clinical note', exact: true })
  await draft.getByLabel('Note', { exact: false }).fill('Unsaved HTTP clinical draft')
  await draft.getByLabel('Clinical date and time', { exact: false }).fill('2026-11-18T10:15')
  await page.getByRole('tab', { name: /^Discussion/ }).click()
  contract.handler = (call) =>
    call.method === 'GET' && call.path === patientPath
      ? failure(503, 'Do not expose this diagnostic')
      : undefined
  const commentForm = page.getByRole('form', { name: 'Add a comment', exact: true })
  await commentForm.getByLabel('Comment', { exact: false }).fill('Trigger profile revalidation')
  await commentForm.getByRole('button', { name: 'Post comment', exact: true }).click()
  await expect.poll(() => contract.matching('GET', patientPath).length).toBe(4)
  await expect(
    page.getByRole('alert').filter({ hasText: /latest|refresh|service is unavailable/i }),
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'HTTP Patient', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /^Notes/ }).click()
  await expect(draft.getByLabel('Note', { exact: false })).toHaveValue(
    'Unsaved HTTP clinical draft',
  )
  await expect(draft.getByLabel('Clinical date and time', { exact: false })).toHaveValue(
    '2026-11-18T10:15',
  )
  contract.handler = () => undefined
  await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(draft.getByLabel('Note', { exact: false })).toHaveValue(
    'Unsaved HTTP clinical draft',
  )
})

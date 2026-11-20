import { expect, test } from '@playwright/test'
import {
  alex,
  anaPath,
  closeWorkspace,
  confirmDeletion,
  directory,
  sam,
  searchPatient,
  selectActor,
} from './demo-helpers'

test('zero notes → timestamped plain-text note → linked discussion → confirmed tombstone', async ({
  page,
}) => {
  await directory(page)
  let noteURL = ''
  const content =
    'E2E clinical observation\n<strong>Literal clinical text & safe rendering</strong>'

  await test.step('A zero count opens the empty Notes tab and accepts a clinical timestamp', async () => {
    await searchPatient(page, 'PT-0006')
    await page
      .getByRole('link', { name: 'Olivia Silva, 0 clinical notes, open Notes', exact: true })
      .click()
    await expect(page.getByRole('tab', { name: /^Notes/ })).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'No clinical notes yet', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Add note', exact: true }).click()
    const form = page.getByRole('form', { name: 'Add clinical note', exact: true })
    await form.getByLabel('Clinical date and time', { exact: false }).fill('2026-11-18T10:15')
    await form.getByLabel('Note', { exact: false }).fill(content)
    await form.getByRole('button', { name: 'Save note', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'E2E clinical observation', exact: true }),
    ).toBeVisible()
    const article = page.getByRole('article')
    await expect(article).toContainText(sam)
    await expect(article.locator('time')).toHaveAttribute('datetime', /2026-11-18T/)
    await expect(article.getByText(content, { exact: true })).toBeVisible()
    await expect(article.locator('strong')).toHaveCount(0)
    noteURL = page.url()
    await closeWorkspace(page)
    await expect(
      page.getByRole('link', { name: 'Olivia Silva, 1 clinical note, open Notes', exact: true }),
    ).toBeFocused()
  })

  await test.step('Link the note to a discussion comment without changing its author', async () => {
    await page.getByRole('link', { name: /Olivia Silva, .*open Discussion/ }).click()
    const form = page.getByRole('form', { name: 'Add a comment', exact: true })
    await form.getByLabel('Comment', { exact: false }).fill('E2E follow-up with clinical reference')
    await form.getByRole('checkbox', { name: /^E2E clinical observation/ }).check()
    await form.getByRole('button', { name: 'Post comment', exact: true }).click()
    const comment = page
      .getByRole('list', { name: 'Comments', exact: true })
      .getByRole('listitem')
      .filter({ hasText: 'E2E follow-up with clinical reference' })
    await expect(comment).toContainText(sam)
    await expect(comment.locator('time')).toHaveCount(1)
    await form
      .getByLabel('Comment', { exact: false })
      .fill('Unsent draft while checking the linked note')
    await comment.getByRole('button', { name: 'E2E clinical observation', exact: true }).click()
    await expect(page).toHaveURL(noteURL)
    await expect(page.getByRole('article')).toContainText(sam)
    await page.getByRole('tab', { name: /^Discussion/ }).click()
    await expect(form.getByLabel('Comment', { exact: false })).toHaveValue(
      'Unsent draft while checking the linked note',
    )
    await comment.getByRole('button', { name: 'E2E clinical observation', exact: true }).click()
    await expect(page).toHaveURL(noteURL)
  })

  await test.step('Confirm deletion, update counts, and retain a non-clickable deleted-note reference', async () => {
    await page.getByRole('button', { name: 'Delete note', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'E2E clinical observation', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Delete note', exact: true }).click()
    await confirmDeletion(page, 'Delete note')
    await expect(
      page.getByRole('heading', { name: 'No clinical notes yet', exact: true }),
    ).toBeVisible()
    await page.getByRole('tab', { name: /^Discussion/ }).click()
    const links = page.getByRole('list', { name: 'Linked clinical notes', exact: true })
    await expect(links).toContainText('Deleted note')
    await expect(links.getByRole('button')).toHaveCount(0)
    await closeWorkspace(page)
    await expect(
      page.getByRole('link', { name: 'Olivia Silva, 0 clinical notes, open Notes', exact: true }),
    ).toBeVisible()
  })
})

test('direct note links survive refresh and enforce author ownership; missing routes recover', async ({
  page,
}) => {
  const notePath = `${anaPath}/notes/20000000-0000-4000-8000-000000000011`
  await test.step('Open another author’s seeded note by URL and refresh the route', async () => {
    await page.goto('/')
    await selectActor(page)
    await page.goto(notePath)
    await expect(page.getByRole('tab', { name: /^Notes/ })).toHaveAttribute('aria-selected', 'true')
    const article = page.getByRole('article')
    await expect(article).toContainText(alex)
    await expect(article.getByRole('button', { name: 'Delete note', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(article).toContainText(alex)
    await expect(article.getByRole('button', { name: 'Delete note', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to Notes', exact: true }).click()
    await page
      .getByRole('button', {
        name: /Synthetic intake: contact details and recorded history reviewed/,
      })
      .click()
    await expect(page.getByRole('article')).toContainText(sam)
    await expect(page.getByRole('button', { name: 'Delete note', exact: true })).toBeVisible()
  })

  await test.step('Direct missing note and patient routes expose useful recovery', async () => {
    await page.goto(`${anaPath}/notes/20000000-0000-4000-8000-999999999999`)
    await expect(page.getByRole('heading', { name: 'Note not found', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back to Notes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Clinical notes', exact: true })).toBeVisible()
    await page.goto('/patients/10000000-0000-4000-8000-999999999999')
    await expect(
      page.getByRole('heading', { name: 'Patient not found', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('100 patients')
  })
})

test('discussion create, edit and delete preserve authors, times and viewer permissions', async ({
  page,
}) => {
  await directory(page)
  await searchPatient(page, 'PT-0001')
  await page.getByRole('link', { name: /Ana J Silva, .*open Discussion/ }).click()
  const comments = page.getByRole('list', { name: 'Comments', exact: true })
  const other = comments.getByRole('listitem').filter({ hasText: alex })
  await expect(other.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0)
  await expect(other.getByRole('button', { name: 'Delete comment', exact: true })).toHaveCount(0)

  await test.step('Create as Sam, edit the body and keep its note link and author', async () => {
    const form = page.getByRole('form', { name: 'Add a comment', exact: true })
    await form.getByLabel('Comment', { exact: false }).fill('E2E care-team message <img src=x>')
    await form
      .getByRole('checkbox', {
        name: /^Synthetic intake: contact details and recorded history reviewed/,
      })
      .check()
    await form.getByRole('button', { name: 'Post comment', exact: true }).click()
    const created = comments
      .getByRole('listitem')
      .filter({ hasText: 'E2E care-team message <img src=x>' })
    await expect(created).toContainText(sam)
    await expect(created.locator('img')).toHaveCount(0)
    await expect(created.locator('time')).toHaveCount(1)
    await expect(created.getByText(/New.*comment during this visit/)).toHaveCount(0)
    await created.getByRole('button', { name: 'Edit comment', exact: true }).click()
    const edit = page.getByRole('form', { name: 'Edit comment', exact: true })
    await expect(
      edit.getByRole('checkbox', {
        name: /^Synthetic intake: contact details and recorded history reviewed/,
      }),
    ).toBeChecked()
    await edit.getByLabel('Comment', { exact: false }).fill('E2E care-team message revised')
    await edit.getByRole('button', { name: 'Save comment', exact: true }).click()
    const revised = comments
      .getByRole('listitem')
      .filter({ hasText: 'E2E care-team message revised' })
    await expect(revised).toContainText(sam)
    await expect(revised).toContainText('Edited')
    await expect(revised.locator('time')).toHaveCount(2)
    await expect(revised.getByRole('list', { name: 'Linked clinical notes' })).toBeVisible()
    await expect(page.getByText('Page 1 · 4 comments', { exact: true })).toBeVisible()
  })

  await test.step('Switch demo users through the app and enforce the new ownership view', async () => {
    await closeWorkspace(page)
    await selectActor(page, alex)
    await expect(
      page.getByRole('link', { name: 'Notifications, 10 unread comments', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('link', { name: /Ana J Silva, 4 comments, 1 unread comment, open Discussion/ })
      .click()
    const revised = comments
      .getByRole('listitem')
      .filter({ hasText: 'E2E care-team message revised' })
    await expect(revised).toContainText(sam)
    await expect(revised.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0)
    await expect(revised.getByRole('button', { name: 'Delete comment', exact: true })).toHaveCount(
      0,
    )
    await expect(other.getByRole('button', { name: 'Edit comment', exact: true })).toBeVisible()
    await closeWorkspace(page)
    await selectActor(page, sam)
    await expect(
      page.getByRole('link', { name: 'Notifications, 11 unread comments', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('link', { name: /Ana J Silva, 4 comments, 0 unread comments, open Discussion/ })
      .click()
    await revised.getByRole('button', { name: 'Delete comment', exact: true }).click()
    await confirmDeletion(page, 'Delete comment')
    await expect(revised).toHaveCount(0)
    await expect(page.getByText('Page 1 · 3 comments', { exact: true })).toBeVisible()
  })
})

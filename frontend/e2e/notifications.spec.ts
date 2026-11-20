import { expect, test } from '@playwright/test'
import {
  closeWorkspace,
  directory,
  openNotifications,
  selectActor,
  alex,
  sam,
  searchPatient,
} from './demo-helpers'

test('unread queue spans the dataset, reads only Discussion and preserves the Patients view', async ({
  page,
}) => {
  await directory(page)
  await page.getByRole('button', { name: 'Inactive', exact: true }).click()
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  const directoryURL = page.url()

  await test.step('Global totals ignore the current page and queue filters stay independent', async () => {
    await openNotifications(page, 12)
    await expect(
      page.getByText('12 unread comments across 12 patients', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('12 patients')
    await expect(page.getByRole('button', { name: 'All patients', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('searchbox')).toHaveValue('')
    await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()
    // These patients occupy opposite ends of the ordinary alphabetical directory.
    await expect(page.getByRole('link', { name: 'Ana J Silva', exact: true })).toBeAttached()
    await page.locator('.ac-list-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(page.getByRole('link', { name: 'Tomás Silva', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'All patients', exact: true }).click()
    await expect(page).toHaveURL(directoryURL)
    await expect(page.getByRole('button', { name: 'Inactive', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  })

  await test.step('Overview and Notes retain unread; Discussion decrements exactly one observed comment', async () => {
    await openNotifications(page, 12)
    await page.getByRole('link', { name: 'Ana J Silva', exact: true }).click()
    await expect(
      page.getByRole('tab', { name: /^Discussion.*3 comments.*1 unread comment/ }),
    ).toBeVisible()
    await page.getByRole('tab', { name: /^Notes/ }).click()
    await expect(page.getByRole('heading', { name: 'Clinical notes', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Discussion.*1 unread comment/ })).toBeVisible()
    await closeWorkspace(page)
    await expect(
      page.getByText('12 unread comments across 12 patients', { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('link', {
        name: 'Ana J Silva, 3 comments, 1 unread comment, open Discussion',
        exact: true,
      })
      .click()
    const comments = page.getByRole('list', { name: 'Comments', exact: true })
    await expect(
      comments.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 4 }) }),
    ).toHaveCount(3)
    await expect(comments.getByText('New comment during this visit', { exact: true })).toHaveCount(
      1,
    )
    await expect(
      page.getByText('Comments that were unread during this visit keep their New label.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Discussion/ })).toHaveAccessibleName(
      'Discussion 3 comments',
    )
    await closeWorkspace(page)
    await expect(
      page.getByText('11 unread comments across 11 patients', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ana J Silva', exact: true })).toHaveCount(0)
    await expect
      .poll(() =>
        page.getByRole('main').evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true)
    await page.getByRole('link', { name: 'All patients', exact: true }).click()
    await page.getByRole('searchbox').fill('PT-0001')
    await expect(page.getByRole('status')).toHaveText('1 patient matching your filters')
    await page
      .getByRole('link', {
        name: 'Ana J Silva, 3 comments, 0 unread comments, open Discussion',
        exact: true,
      })
      .click()
    await expect(
      comments.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 4 }) }),
    ).toHaveCount(3)
    await expect(comments.getByText('New comment during this visit', { exact: true })).toHaveCount(
      0,
    )
    await closeWorkspace(page)
  })
})

test('clearing the full queue reaches zero, clamps invalid pages and isolates demo users', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await directory(page)
  await test.step('Alex has an independent nine-patient queue and invalid queue pages clamp', async () => {
    await selectActor(page, alex)
    await openNotifications(page, 9)
    await expect(
      page.getByText('9 unread comments across 9 patients', { exact: true }),
    ).toBeVisible()
    const url = new URL(page.url())
    url.searchParams.set('page', '2')
    await page.goto(url.toString())
    await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/page=1/)
    const actorFlashes = await page.evaluateHandle(() => {
      const staleLabels: string[] = []
      const observer = new MutationObserver(() => {
        const selected = document.querySelector('[aria-label="Select demo user"]')?.textContent
        if (!selected?.includes('Sam Rivera')) return
        for (const link of document.querySelectorAll<HTMLElement>(
          'a[aria-label^="Notifications,"]',
        )) {
          if (
            link.checkVisibility() &&
            link.getAttribute('aria-label') === 'Notifications, 9 unread comments'
          )
            staleLabels.push(link.getAttribute('aria-label')!)
        }
      })
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      })
      return { staleLabels, observer }
    })
    await selectActor(page, sam)
    await expect(
      page.getByText('12 unread comments across 12 patients', { exact: true }),
    ).toBeVisible()
    expect(
      await actorFlashes.evaluate(({ staleLabels, observer }) => {
        observer.disconnect()
        return staleLabels
      }),
    ).toEqual([])
    await actorFlashes.dispose()
  })

  await test.step('Read all twelve affected patients through the visible queue', async () => {
    for (let remaining = 12; remaining > 0; remaining--) {
      const activity = page
        .getByRole('link', { name: /, 3 comments, 1 unread comment, open Discussion$/ })
        .first()
      await activity.click()
      await expect(
        page
          .getByRole('list', { name: 'Comments', exact: true })
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { level: 4 }) }),
      ).toHaveCount(3)
      await expect(
        page.getByText('Comments that were unread during this visit keep their New label.', {
          exact: true,
        }),
      ).toBeVisible()
      await closeWorkspace(page)
      await expect(
        page.getByText(
          `${remaining - 1} unread ${remaining - 1 === 1 ? 'comment' : 'comments'} across ${remaining - 1} ${remaining - 1 === 1 ? 'patient' : 'patients'}`,
          { exact: true },
        ),
      ).toBeVisible()
      await expect
        .poll(() =>
          page.getByRole('main').evaluate((element) => ({
            inside: element.contains(document.activeElement),
            connected: document.activeElement?.isConnected,
          })),
        )
        .toEqual({ inside: true, connected: true })
    }
    await expect(
      page.getByRole('heading', { name: 'You’re all caught up', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Notifications, no unread comments', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeFocused()
  })

  await test.step('Reading Sam’s queue leaves Alex’s unread state intact', async () => {
    await selectActor(page, alex)
    await expect(
      page.getByText('9 unread comments across 9 patients', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'You’re all caught up', exact: true }),
    ).toHaveCount(0)
    await selectActor(page, sam)
    await expect(
      page.getByRole('heading', { name: 'You’re all caught up', exact: true }),
    ).toBeVisible()
  })
})

test('paged discussions acknowledge only displayed comments and queue removal clamps the last page', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await directory(page)

  await test.step('Create unread conversations through Sam’s composer, including an eleven-comment thread', async () => {
    // Alex begins with nine affected patients. Twelve new conversations cross
    // the real 20-row queue boundary without replacing the app’s demo adapter.
    const sequences = [13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25]
    for (const sequence of sequences) {
      await searchPatient(page, `PT-${String(sequence).padStart(4, '0')}`)
      await page.getByRole('link', { name: /open Discussion$/ }).click()
      const composer = page.getByRole('form', { name: 'Add a comment', exact: true })
      const body = `E2E queue-boundary conversation ${sequence}`
      await composer.getByLabel('Comment', { exact: false }).fill(body)
      await composer.getByRole('button', { name: 'Post comment', exact: true }).click()
      await expect(page.getByText(body, { exact: true })).toBeVisible()
      await closeWorkspace(page)
    }
    await expect(
      page.getByRole('link', { name: 'Notifications, 12 unread comments', exact: true }),
    ).toBeVisible()
    await searchPatient(page, 'PT-0013')
    await page.getByRole('link', { name: /open Discussion$/ }).click()
    const composer = page.getByRole('form', { name: 'Add a comment', exact: true })
    for (let index = 1; index <= 10; index++) {
      const body = `E2E observed-page comment ${index}`
      await composer.getByLabel('Comment', { exact: false }).fill(body)
      await composer.getByRole('button', { name: 'Post comment', exact: true }).click()
      await expect(page.getByText(body, { exact: true })).toBeVisible()
    }
    await expect(page.getByText('Page 1 · 11 comments', { exact: true })).toBeVisible()
    await expect(composer.getByText('Comment posted.', { exact: true })).toBeVisible()
    const snapshot = page.getByRole('list', { name: 'Comments', exact: true })
    await expect(snapshot.getByRole('listitem')).toHaveCount(10)
    await expect(snapshot.getByRole('listitem').first()).toContainText(
      'E2E queue-boundary conversation 13',
    )
    await expect(snapshot.getByRole('listitem').last()).toContainText('E2E observed-page comment 9')
    await expect(page.getByRole('complementary', { name: 'Just posted comment' })).toContainText(
      'E2E observed-page comment 10',
    )
    await closeWorkspace(page)
    await selectActor(page, alex)
    await openNotifications(page, 31)
    await expect(
      page.getByText('31 unread comments across 21 patients', { exact: true }),
    ).toBeVisible()
  })

  await test.step('Read the sole record on page two; restore valid focus on the clamped queue', async () => {
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
    await page
      .getByRole('link', { name: /, 3 comments, 1 unread comment, open Discussion$/ })
      .click()
    await expect(
      page.getByText('Comments that were unread during this visit keep their New label.', {
        exact: true,
      }),
    ).toBeVisible()
    await closeWorkspace(page)
    await expect(
      page.getByText('30 unread comments across 20 patients', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/page=1/)
    await expect
      .poll(() =>
        page.getByRole('main').evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true)
  })

  await test.step('The oldest ten displayed comments leave the cursor continuation unread', async () => {
    await page.getByRole('link', { name: 'All patients', exact: true }).click()
    await searchPatient(page, 'PT-0013')
    await page
      .getByRole('link', { name: /, 11 comments, 11 unread comments, open Discussion$/ })
      .click()
    const comments = page.getByRole('list', { name: 'Comments', exact: true })
    await expect(page.getByText('Comments are shown oldest first.', { exact: false })).toBeVisible()
    await expect(comments.getByRole('listitem')).toHaveCount(10)
    await expect(comments.getByRole('listitem').first()).toContainText(
      'E2E queue-boundary conversation 13',
    )
    await expect(comments.getByRole('listitem').last()).toContainText('E2E observed-page comment 9')
    await expect(comments.getByText('New comment during this visit', { exact: true })).toHaveCount(
      10,
    )
    await expect(
      page.getByText('Comments that were unread during this visit keep their New label.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Discussion/ })).toHaveAccessibleName(
      'Discussion 11 comments 1 unread comment',
    )
    const draft = page
      .getByRole('form', { name: 'Add a comment', exact: true })
      .getByLabel('Comment', { exact: false })
    await draft.fill('Unsent draft while reading the next chronological page')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Page 2 · 11 comments', { exact: true })).toBeVisible()
    await expect(comments.getByRole('listitem')).toHaveCount(1)
    await expect(comments.getByRole('listitem')).toContainText('E2E observed-page comment 10')
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await expect(comments.getByText('New comment during this visit', { exact: true })).toHaveCount(
      1,
    )
    await expect(page.getByRole('tab', { name: /^Discussion/ })).toHaveAccessibleName(
      'Discussion 11 comments',
    )
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page.getByText('Page 1 · 11 comments', { exact: true })).toBeVisible()
    await expect(comments.getByText('New comment during this visit', { exact: true })).toHaveCount(
      10,
    )
    await page.getByRole('button', { name: 'Refresh discussion', exact: true }).click()
    await expect(draft).toHaveValue('Unsent draft while reading the next chronological page')
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
    await expect(page.getByRole('tab', { name: /^Discussion/ })).toHaveAccessibleName(
      'Discussion 11 comments',
    )
    await closeWorkspace(page)
    await expect(
      page.getByRole('link', { name: 'Notifications, 19 unread comments', exact: true }),
    ).toBeVisible()
    await selectActor(page, sam)
    await expect(
      page.getByRole('link', { name: 'Notifications, 12 unread comments', exact: true }),
    ).toBeVisible()
  })
})

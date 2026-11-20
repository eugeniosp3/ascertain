import { expect, test } from '@playwright/test'
import {
  choose,
  closeWorkspace,
  directory,
  expectNoPageOverflow,
  openNotifications,
  patientNames,
  selectActor,
} from './demo-helpers'

test('home → directory: debounced search, full-dataset filters, sorting and browser history', async ({
  page,
}) => {
  await test.step('Enter the explicit demo from home and inspect the directory', async () => {
    await page.goto('/')
    await expect(page.getByText('Demo workspace', { exact: false })).toBeVisible()
    await selectActor(page)
    await expect(page.locator('.ac-overview-summary')).toContainText(/\d+ assigned patients/)
    // Observe visible DOM throughout the transition so a brief empty/error
    // render cannot be hidden by a later successful assertion.
    const flashes = await page.evaluateHandle(() => {
      const messages: string[] = []
      const observer = new MutationObserver(() => {
        for (const element of document.querySelectorAll<HTMLElement>('h2, [role="alert"]')) {
          const text = element.textContent ?? ''
          if (
            element.checkVisibility() &&
            /No patients yet|No matching patients|Patients couldn’t be loaded/.test(text)
          )
            messages.push(text)
        }
      })
      observer.observe(document.body, { childList: true, characterData: true, subtree: true })
      return { messages, observer }
    })
    await page.getByRole('link', { name: /Patient directory/ }).click()
    await expect(page.getByRole('status')).toHaveText('100 patients')
    expect(
      await flashes.evaluate(({ messages, observer }) => {
        observer.disconnect()
        return messages
      }),
    ).toEqual([])
    await flashes.dispose()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No patients yet' })).toHaveCount(0)
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      for (const column of [
        'Patient',
        'Age',
        'Last visit',
        'Status',
        'Clinical notes',
        'Conversation',
      ]) {
        await expect(
          page.getByRole('columnheader', { name: new RegExp(`^Sort by ${column}`) }),
        ).toBeVisible()
      }
    } else {
      const card = page
        .getByRole('list', { name: 'Patients', exact: true })
        .getByRole('listitem')
        .filter({ has: page.getByRole('link') })
        .first()
      await expect(card).toContainText('years old')
      await expect(card).toContainText('Last visit:')
      await expect(card.getByRole('link', { name: /clinical notes.*open Notes/ })).toBeVisible()
      await expect(card.getByRole('link', { name: /comments.*open Discussion/ })).toBeVisible()
    }
  })

  await test.step('Typing stays responsive and preserves results during the 250 ms debounce', async () => {
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    const search = page.getByRole('searchbox', { name: 'Search patients' })
    await search.fill('ana.1@example.com')
    await expect(search).toHaveValue('ana.1@example.com')
    await expect(page.getByRole('status')).toHaveText('100 patients')
    await page.clock.runFor(249)
    expect(new URL(page.url()).searchParams.get('q')).not.toBe('ana.1@example.com')
    await expect(page.getByRole('heading', { name: 'No matching patients' })).toHaveCount(0)
    await page.clock.runFor(1)
    await page.clock.resume()
    await expect(page.getByRole('status')).toHaveText('1 patient matching your filters')
    await expect(page.getByRole('link', { name: 'Ana J Silva', exact: true })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Notifications, 12 unread comments', exact: true }),
    ).toBeVisible()
  })

  await test.step('Filter and sort across all 100 patients, then restore URL state', async () => {
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('75 patients matching your filters')
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await page.getByRole('button', { name: /^Sort by Age/ }).click()
      await expect(page.getByRole('columnheader', { name: /^Sort by Age/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      )
    } else {
      await choose(
        page,
        page.getByRole('combobox', { name: 'Sort patients' }),
        'Age, youngest first',
      )
    }
    await expect(page.getByRole('link', { name: 'Daniel García', exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('sort_by')).toBe('dob')
    expect(new URL(page.url()).searchParams.get('order')).toBe('desc')
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
    const savedURL = page.url()
    await page.reload()
    await expect(page.getByRole('status')).toHaveText('75 patients matching your filters')
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.getByText('Page 3 of 4', { exact: true })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(savedURL)
    await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
    await page.goForward()
    await expect(page.getByText('Page 3 of 4', { exact: true })).toBeVisible()
  })
})

test('navigation exposes collapsed tooltips, expanded labels and the mobile menu', async ({
  page,
}) => {
  await directory(page)
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await test.step('Use the mobile menu and global bell', async () => {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      const menu = page.getByRole('dialog')
      await expect(menu.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
      await menu.getByRole('link', { name: 'Overview', exact: true }).click()
      await expect(menu).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
      await openNotifications(page, 12)
    })
  } else {
    await test.step('Hover and keyboard focus label the collapsed icons', async () => {
      const patients = page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Patients', exact: true })
      await patients.hover()
      await expect(page.getByRole('tooltip', { name: 'Patients', exact: true })).toBeVisible()
      await page.mouse.move(700, 80)
      await patients.focus()
      await expect(page.getByRole('tooltip', { name: 'Patients', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Expand sidebar' }).click()
      await patients.hover()
      await expect(page.getByRole('tooltip')).toHaveCount(0)
      await expect(patients).toHaveText('Patients')
      await patients.focus()
      await expect(page.getByRole('tooltip')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
    })
  }
})

test('50/100-row pages virtualize and restore a scrolled workspace visit', async ({ page }) => {
  await directory(page)
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await page.setViewportSize({ width: 1440, height: 720 })
  }
  for (const size of [50, 100]) {
    await test.step(`${size} records stay in data while only viewport rows mount`, async () => {
      await choose(page, page.getByRole('combobox', { name: 'Rows per page' }), String(size))
      await expect(page.getByText(`Page 1 of ${100 / size}`, { exact: true })).toBeVisible()
      // includeHidden proves that the remaining rows are unmounted, not CSS-hidden.
      const names = page
        .getByRole('main')
        .getByRole('link', { includeHidden: true })
        .filter({ hasNot: page.locator('svg') })
      await expect(names.first()).toBeVisible()
      expect(await names.count()).toBeLessThan(size)
      const lastName = size === 50 ? 'Tomás Nguyen' : 'Tomás J Thompson'
      const scroll = page.locator('.ac-list-scroll')
      await scroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await expect(page.getByRole('link', { name: lastName, exact: true })).toBeVisible()
      expect(await names.count()).toBeLessThan(size)
    })
  }

  await test.step('A detail visit removes the table and restores scroll, focus and highlight', async () => {
    const trigger = page.getByRole('link', { name: 'Tomás J Thompson', exact: true })
    await trigger.focus()
    const listURL = page.url()
    await trigger.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Tomás J Thompson', exact: true })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('table', { includeHidden: true })).toHaveCount(0)
    await expect(
      page.getByRole('list', { name: 'Patients', exact: true, includeHidden: true }),
    ).toHaveCount(0)
    const viewport = page.viewportSize()!
    const bounds = (await dialog.boundingBox())!
    if (viewport.width < 768) {
      expect(bounds.x).toBe(0)
      expect(bounds.y).toBe(0)
      expect(bounds.width).toBe(viewport.width)
      expect(bounds.height).toBe(viewport.height)
    } else {
      expect(bounds.x).toBeGreaterThan(64)
      expect(bounds.y).toBeGreaterThan(0)
      expect(bounds.width).toBeLessThan(viewport.width)
      const header = await dialog.locator('header').boundingBox()
      const sections = await dialog.getByRole('tablist').boundingBox()
      expect(header!.y + header!.height).toBeLessThan(sections!.y)
    }
    await expect(
      dialog.getByRole('heading', { name: 'Tomás J Thompson', exact: true }),
    ).toBeFocused()
    const content = dialog
      .locator('.pw-scroll')
      .filter({ has: page.getByRole('tabpanel', { name: 'Overview' }) })
    // The compact profile no longer needs a tall page. Give this behavior check
    // enough scrollable content to cross the identity header's threshold.
    if (viewport.width >= 768) {
      await page.setViewportSize({ width: viewport.width, height: 520 })
    }
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(dialog.locator('header')).toHaveAttribute('data-compact', 'true')
    await expect(
      dialog.getByRole('heading', { name: 'Tomás J Thompson', exact: true }),
    ).toBeVisible()
    await content.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect(dialog.locator('header')).toHaveAttribute('data-compact', 'false')
    if (viewport.width >= 768) await page.setViewportSize(viewport)
    const close = dialog.getByRole('button', {
      name: viewport.width < 768 ? 'Back' : 'Close patient workspace',
      exact: true,
    })
    const lastControl = dialog.getByRole('button').last()
    await lastControl.focus()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(lastControl).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(listURL)
    await expect(trigger).toBeFocused()
    await expect(trigger.locator('xpath=ancestor::*[self::tr or self::li][1]')).toHaveClass(
      /ac-last-visited/,
    )
    await expect(trigger).toBeInViewport()
    await trigger.click()
    await page.goBack()
    await expect(trigger).toBeFocused()
    await page.goForward()
    await expect(page.getByRole('dialog', { name: 'Tomás J Thompson', exact: true })).toBeVisible()
    await closeWorkspace(page)
  })

  await test.step('Restore search, status, sorting and a scrolled second page together', async () => {
    await choose(page, page.getByRole('combobox', { name: 'Rows per page' }), '20')
    await page.getByRole('searchbox', { name: 'Search patients' }).fill('example.com')
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'example.com')
    await expect(page.getByRole('status')).toHaveText('100 patients matching your filters')
    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('75 patients matching your filters')
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await page.getByRole('button', { name: /^Sort by Patient/ }).click()
    } else {
      await choose(page, page.getByRole('combobox', { name: 'Sort patients' }), 'Name, Z–A')
    }
    await expect(page).toHaveURL((url) => url.searchParams.get('order') === 'desc')
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('75 patients matching your filters')
    await page.locator('.ac-list-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    // This is the final active record on the second Z–A page. Wait for
    // that record rather than sampling the previous virtual viewport.
    const name = 'Priya Nguyen'
    const trigger = page.getByRole('link', { name, exact: true })
    await expect(trigger).toBeVisible()
    const url = page.url()
    await trigger.click()
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible()
    await closeWorkspace(page)
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('searchbox')).toHaveValue('example.com')
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name, exact: true })).toBeFocused()
    await expect(trigger).toBeInViewport()
  })
})

test('directory, notifications, workspace and forms fit targeted responsive widths', async ({
  page,
}) => {
  await directory(page)
  const widths = (page.viewportSize()?.width ?? 0) < 768 ? [375, 390] : [768, 1024, 1440]
  for (const width of widths) {
    await test.step(`No horizontal page overflow at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 960 })
      await expect(patientNames(page).first()).toBeVisible()
      await expectNoPageOverflow(page)
      await openNotifications(page, 12)
      await expectNoPageOverflow(page)
      await page
        .getByRole('link', { name: /clinical notes.*open Notes/ })
        .first()
        .click()
      await expect(page.getByRole('heading', { name: 'Clinical notes', exact: true })).toBeVisible()
      await expectNoPageOverflow(page)
      await closeWorkspace(page)
      await page.getByRole('link', { name: 'All patients', exact: true }).click()
      await page.getByRole('link', { name: 'Add patient', exact: true }).click()
      await expect(page.getByRole('form', { name: 'Add patient', exact: true })).toBeVisible()
      await expectNoPageOverflow(page)
      await page
        .getByRole('form', { name: 'Add patient', exact: true })
        .getByRole('button', { name: 'Cancel', exact: true })
        .click()
    })
  }
})

import { expect, test, type Page } from '@playwright/test'
import { alex, anaPath, choose, sam, selectActor } from './demo-helpers'

// Opus visual follow-up (F2/F3/F4/F5, C1, A2/A3, AST-001): geometry and hierarchy invariants on the
// in-memory demo. These measure rendered layout; they do not prove API or persistence behaviour.

async function open(page: Page, path: string) {
  // Default-actor contract: the first demo user is in effect without a choice. Builds from before
  // that contract still show "Choose a user"; only then is the same user picked explicitly, on the
  // directory, because the workspace modal makes the header inert.
  await page.goto('/patients')
  const actor = page.getByRole('combobox', { name: 'Select demo user' })
  await expect(actor).not.toHaveText(/Loading users/)
  if ((await actor.textContent())?.includes('Choose a user')) await selectActor(page)
  await expect(actor).toHaveText(sam)
  if (path !== '/patients') await page.goto(path)
}

async function fullCards(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('.ac-list-scroll')!.getBoundingClientRect()
    return [...document.querySelectorAll('.ac-patient-card')].filter((card) => {
      const box = card.getBoundingClientRect()
      return box.top >= list.top - 0.5 && box.bottom <= list.bottom + 0.5
    }).length
  })
}

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only')

  test('390×844: one header bar, one-line demo banner, at least three whole cards', async ({
    page,
  }) => {
    await open(page, '/patients')
    await expect(page.getByRole('status')).toHaveText('100 patients')
    const header = await page.locator('.ac-topbar').boundingBox()
    const banner = await page.locator('.ac-demo-banner').boundingBox()
    expect(header!.height).toBeLessThanOrEqual(60)
    expect(banner!.height).toBeLessThanOrEqual(30)
    // The demo-user control stays a visible combobox with the full display name.
    await expect(page.getByRole('combobox', { name: 'Select demo user' })).toBeVisible()
    expect(await fullCards(page)).toBeGreaterThanOrEqual(3)
  })

  test('375×667: at least two whole cards and every page size fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await open(page, '/patients')
    await expect(page.getByRole('status')).toHaveText('100 patients')
    expect(await fullCards(page)).toBeGreaterThanOrEqual(2)
    const trigger = page.getByRole('combobox', { name: 'Rows per page' })
    for (const size of ['50', '100', '20']) {
      await choose(page, trigger, size)
      await expect(trigger).toHaveText(size)
      const clipped = await trigger
        .locator('[data-slot=select-value]')
        .evaluate((value) => value.scrollWidth > value.clientWidth + 1)
      expect(clipped, `page size ${size} is clipped`).toBe(false)
    }
  })

  test('375: all four workspace tabs and their counts fit without a scrolling strip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await open(page, `${anaPath}?tab=overview`)
    const tablist = page.getByRole('tablist', { name: 'Patient record sections' })
    await expect(tablist.getByRole('tab')).toHaveCount(4)
    const fit = await tablist.evaluate((list) => {
      const bounds = list.getBoundingClientRect()
      return {
        scrolls: list.scrollWidth > list.clientWidth + 1,
        outside: [...list.querySelectorAll('[role=tab]')]
          .filter(
            (tab) => tab.getBoundingClientRect().right > Math.min(bounds.right, innerWidth) + 0.5,
          )
          .map((tab) => tab.textContent),
      }
    })
    expect(fit).toEqual({ scrolls: false, outside: [] })
    await expect(tablist.getByRole('tab', { name: /^Discussion/ })).toBeInViewport({ ratio: 1 })
  })

  test('390: the AI-summary hint wraps and stays on screen when opened from the keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, `${anaPath}?tab=summary`)
    await page.getByRole('button', { name: 'About AI summaries' }).focus()
    await expect(page.getByRole('tooltip')).toHaveText(
      "AI-generated summary. It refreshes automatically when this patient's data changes.",
    )
    // The visible bubble (not Radix's hidden copy) must fit inside the 390px viewport.
    const box = await page.locator('[data-slot="tooltip-content"]').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  })

  test('the menu sheet offers the labelled demo-user selector, with unique ids', async ({
    page,
  }) => {
    await open(page, '/patients')
    await page.getByRole('button', { name: 'Open navigation' }).click()
    const menu = page.getByRole('dialog')
    const selector = menu.getByRole('combobox', { name: 'Select demo user' })
    await expect(selector).toHaveText(sam)
    await expect(menu.getByText('Demo user', { exact: true })).toBeVisible()
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
      return ids.filter((id, index) => ids.indexOf(id) !== index)
    })
    expect(duplicates).toEqual([])
    await choose(page, selector, alex)
    await expect(selector).toHaveText(alex)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Select demo user' })).toHaveText(alex)
  })
})

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop layout only')

  test('actor name is not truncated and the current page has a persistent rail marker', async ({
    page,
  }) => {
    await open(page, '/patients')
    const value = page.locator('#demo-actor [data-slot=select-value]')
    expect(await value.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    )
    const marker = await page
      .locator('.ac-sidebar .ac-nav-item[aria-current=page]')
      .evaluate((item) => getComputedStyle(item, '::before').width)
    expect(marker).toBe('3px')
  })

  test('overview names the selected user and the assigned denominator; unread stays global', async ({
    page,
  }) => {
    await open(page, '/')
    await expect(page.getByRole('region', { name: 'Your patients' })).toContainText(
      `Assigned to ${sam}`,
    )
    await expect(page.locator('.ac-overview-summary')).toHaveText(
      /^\d+ assigned patients? · \d+ unread comments? across all patients$/,
    )
  })

  test('visits chart opens on the last complete month and marks the running month partial', async ({
    page,
  }) => {
    await open(page, '/')
    const chart = page.getByRole('figure', { name: 'Latest recorded visit' })
    const slider = chart.getByRole('slider', { name: /Inspect month/ })
    await expect(slider).not.toHaveAttribute('aria-valuetext', /partial/)
    await expect(chart.locator('.ac-visits-point').last()).toHaveAttribute('data-partial')
    await slider.focus()
    await page.keyboard.press('End')
    await expect(slider).toHaveAttribute('aria-valuetext', /\(partial\)/)
  })

  test('discussion keeps maintenance actions quiet and identity facts appear once', async ({
    page,
  }) => {
    await open(page, `${anaPath}?tab=discussion`)
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('button', { name: 'Edit comment', exact: true }).first(),
    ).toBeVisible()
    const red = await dialog
      .locator('[role=tabpanel]:not([hidden]) button')
      .evaluateAll(
        (buttons) =>
          buttons.filter((button) =>
            /rgb\(179, 32, 58\)|rgb\(255, 156, 169\)/.test(getComputedStyle(button).color),
          ).length,
      )
    expect(red).toBe(0)
    await expect(dialog.locator('.pw-comment-avatar').first()).toHaveText('SR')
    await dialog.getByRole('tab', { name: /^Overview/ }).click()
    for (const fact of ['DOB', 'Age', 'MRN']) {
      await expect(dialog.getByText(fact, { exact: true })).toHaveCount(1)
    }
  })
})

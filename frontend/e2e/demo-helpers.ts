import { expect, type Locator, type Page } from '@playwright/test'

export const sam = 'Demo User 1 · Sam Rivera'
export const alex = 'Demo User 2 · Alex Morgan'
export const anaPath = '/patients/10000000-0000-4000-8000-000000000001'

export async function selectActor(page: Page, name = sam) {
  await page.getByRole('combobox', { name: 'Select demo user' }).click()
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Select demo user' })).toHaveText(name)
}

export async function directory(page: Page) {
  await page.goto('/patients')
  await selectActor(page)
  await expect(page.getByRole('status')).toHaveText('100 patients')
}

export async function choose(page: Page, control: Locator, option: string) {
  await control.click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

export async function searchPatient(page: Page, query: string) {
  await page.getByRole('searchbox', { name: 'Search patients' }).fill(query)
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === query)
  await expect(page.getByRole('status')).toHaveText('1 patient matching your filters')
}

export async function closeWorkspace(page: Page) {
  const dialog = page.getByRole('dialog')
  const mobile = (page.viewportSize()?.width ?? 1440) < 768
  await dialog
    .getByRole('button', { name: mobile ? 'Back' : 'Close patient workspace', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
}

export async function openNotifications(page: Page, count: number) {
  await page
    .getByRole('link', { name: `Notifications, ${count} unread comments`, exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
}

export function patientNames(page: Page) {
  // Patient names are the record links without an activity-count label.
  return page
    .getByRole('main')
    .getByRole('link')
    .filter({ hasNotText: /Add patient/ })
    .filter({
      hasNot: page.locator('svg'),
    })
}

export async function confirmDeletion(page: Page, label: string) {
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

export async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1)
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1)
}

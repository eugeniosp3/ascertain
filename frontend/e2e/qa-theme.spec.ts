import { expect, test, type Page } from '@playwright/test'
import { directory } from './demo-helpers'

async function openTheme(page: Page) {
  if (!(await page.getByRole('button', { name: 'Theme', exact: true }).isVisible())) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Theme', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toBeVisible()
}

async function chooseTheme(page: Page, choice: 'Light' | 'Dark' | 'System') {
  await openTheme(page)
  await page.getByRole('menuitemradio', { name: choice, exact: true }).click()
  await expect(page.getByRole('menuitemradio')).toHaveCount(0)
}

async function expectExpandedTrigger(page: Page, choice: string) {
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true })
  if (await expand.isVisible()) await expand.click()
  await expect(page.getByRole('button', { name: 'Theme', exact: true })).toHaveText(
    new RegExp(`Theme\\s*${choice}`),
  )
}

async function expectResolved(page: Page, choice: 'light' | 'dark') {
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${choice}\\b`))
  await expect(page.locator('html')).not.toHaveClass(
    new RegExp(`\\b${choice === 'dark' ? 'light' : 'dark'}\\b`),
  )
  await expect(page.locator('html')).toHaveCSS('color-scheme', choice)
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', choice)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    choice === 'dark' ? '#1e1d1c' : '#f4f3ef',
  )
}

test('QA theme: choose Dark updates theme, persists preference and checks Dark menu item', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await directory(page)
  await chooseTheme(page, 'Dark')
  await expectResolved(page, 'dark')
  await expectExpandedTrigger(page, 'Dark')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ascertain:ui-preferences')!).state.theme,
    ),
  ).toBe('dark')
  await openTheme(page)
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(page.getByRole('menuitemradio', { checked: true })).toHaveCount(1)
})

test('QA theme: choose Light reverses Dark and checks Light menu item', async ({ page }) => {
  await directory(page)
  await chooseTheme(page, 'Dark')
  await expectResolved(page, 'dark')
  await chooseTheme(page, 'Light')
  await expectResolved(page, 'light')
  await expectExpandedTrigger(page, 'Light')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ascertain:ui-preferences')!).state.theme,
    ),
  ).toBe('light')
  await openTheme(page)
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemradio', { checked: true })).toHaveCount(1)
})

test('QA theme: System tracks live operating-system dark and light changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await directory(page)
  await chooseTheme(page, 'Dark')
  await chooseTheme(page, 'System')
  await expectResolved(page, 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectResolved(page, 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expectResolved(page, 'light')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ascertain:ui-preferences')!).state.theme,
    ),
  ).toBe('system')
  await openTheme(page)
  await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('QA theme: explicit Dark survives reload when operating system is Light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await directory(page)
  await chooseTheme(page, 'Dark')
  await expectResolved(page, 'dark')
  await page.reload()
  await expectResolved(page, 'dark')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('ascertain:ui-preferences')!).state.theme,
    ),
  ).toBe('dark')
  await openTheme(page)
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

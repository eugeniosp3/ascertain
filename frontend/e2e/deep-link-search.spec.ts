import { expect, test, type Page } from '@playwright/test'
import { alex, sam, selectActor } from './demo-helpers'

// Regression: a deep link's ?q= must survive the first load and a demo-user switch on both list
// routes. The live discussion journey opens /notifications?q=<token>, then switches the viewer.

async function expectSearch(page: Page, path: string, q: string) {
  const box = page.getByRole('searchbox', { name: 'Search patients' })
  await expect(box).toHaveValue(q)
  await expect.poll(() => new URL(page.url()).pathname).toBe(path)
  // The router writes number-like text JSON-quoted (q=%2212345%22); either form must mean q.
  await expect
    .poll(() => {
      const raw = new URL(page.url()).searchParams.get('q') ?? ''
      return raw.startsWith('"') ? JSON.parse(raw) : raw
    })
    .toBe(q)
}

// The numeric term is the case that broke: the router's JSON search parser read it as a number.
for (const [path, q] of [
  ['/patients', 'adams'],
  ['/notifications', 'thomas'],
  ['/patients', '47247945115246'],
  ['/notifications', '47247945115246'],
] as const) {
  test(`${path}?q=${q} keeps its search term on load and after switching the demo user`, async ({
    page,
  }) => {
    await page.goto(`${path}?q=${q}`)
    const actor = page.getByRole('combobox', { name: 'Select demo user' })
    await expect(actor).toHaveText(sam)
    await expectSearch(page, path, q)
    // Wait past the 250 ms search debounce: nothing may commit an empty draft over the URL.
    await page.waitForTimeout(400)
    await expectSearch(page, path, q)
    await selectActor(page, alex)
    await page.waitForTimeout(400)
    await expectSearch(page, path, q)
  })
}

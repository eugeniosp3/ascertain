import { expect, test, type Locator, type Page } from '@playwright/test'
import { selectActor } from './demo-helpers'

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target, 'The originating Notes action is reachable using Tab').toBeFocused()
}

for (const scenario of [
  { name: 'one patient', search: '?q=PT-0003' },
  {
    name: 'filtered sorted second page',
    search: '?q=example.com&status=active&sort_by=name&order=desc&page=2&page_size=20',
  },
]) {
  test(`Notes keyboard history restores its origin repeatedly: ${scenario.name}`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    const blockedRequests: string[] = []
    // This regression uses the compiled synthetic adapter and never reaches a live API.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== new URL(baseURL!).origin || /^\/api(?:\/|$)/.test(url.pathname)) {
        blockedRequests.push(url.href)
        return route.abort('blockedbyclient')
      }
      return route.continue()
    })
    const phases: object[] = []
    const observe = async (phase: string) => {
      phases.push({
        phase,
        url: page.url(),
        ...(await page.evaluate(() => ({
          activeElement: document.activeElement?.outerHTML,
          scrollTop: document.querySelector('.ac-list-scroll')?.scrollTop,
        }))),
      })
    }
    try {
      await page.goto(`/patients${scenario.search}`)
      await expect(page.locator('.ac-demo-banner')).toContainText('Synthetic patient records')
      await selectActor(page)
      const scroller = page.locator('.ac-list-scroll')
      await expect(scroller).toHaveAttribute('aria-busy', 'false')
      const row = page.locator('[data-patient-id]').first()
      const patientId = await row.getAttribute('data-patient-id')
      const name = await row.locator('[data-open-tab="overview"]').innerText()
      const trigger = page.locator(`[data-patient-id="${patientId}"] a[data-open-tab="notes"]`)
      const listURL = page.url()
      const listControls = async () => ({
        query: await page.getByRole('searchbox', { name: 'Search patients' }).inputValue(),
        active: await page
          .getByRole('button', { name: 'Active', exact: true })
          .getAttribute('aria-pressed'),
        pagination: await page.locator('.ac-page-nav').innerText(),
        sort:
          (page.viewportSize()?.width ?? 1440) < 768
            ? await page.getByRole('combobox', { name: 'Sort patients' }).innerText()
            : await page.locator('th.ac-col-name').getAttribute('aria-sort'),
      })
      const originalControls = await listControls()
      await tabTo(page, trigger)
      await observe('keyboard-origin')
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name, exact: true })
      await expect(dialog).toBeVisible()
      const workspaceURL = page.url()
      for (let visit = 1; visit <= 3; visit++) {
        await page.goBack()
        await expect(page).toHaveURL(listURL)
        await expect(
          trigger,
          `Browser return ${visit} restores the original Notes action`,
        ).toBeFocused()
        await expect(page.locator(`[data-patient-id="${patientId}"]`)).toHaveClass(
          /ac-last-visited/,
        )
        expect(await listControls()).toEqual(originalControls)
        await observe(`return-${visit}`)
        if (visit < 3) {
          await page.goForward()
          await expect(page).toHaveURL(workspaceURL)
          await expect(dialog).toBeVisible()
          await expect(dialog.getByRole('heading', { name, exact: true })).toBeFocused()
          await observe(`forward-${visit}`)
        }
      }
    } finally {
      await observe('final')
      await info.attach('repeated-history-focus.json', {
        body: JSON.stringify({ phases, blockedRequests }, null, 2),
        contentType: 'application/json',
      })
    }
    expect(blockedRequests, 'Compiled DEMO requests remain isolated from live data').toEqual([])
  })
}

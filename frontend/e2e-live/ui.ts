import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test'
import { expectStatus, type Actor, type LiveApi, type PatientPage } from './api'

/** Observe real browser traffic. These helpers never intercept or replace requests. */
export function apiRequestMatches(api: LiveApi, request: Request, method: string, path: string) {
  const expected = new URL(api.apiURL(path))
  const actual = new URL(request.url())
  return (
    request.method() === method &&
    actual.origin === expected.origin &&
    actual.pathname === expected.pathname &&
    [...expected.searchParams].every(([key, value]) => actual.searchParams.get(key) === value)
  )
}

export function waitForAPI(
  page: Page,
  api: LiveApi,
  method: string,
  path: string,
  actorId?: string,
) {
  const pending = page.waitForResponse(
    (response) =>
      apiRequestMatches(api, response.request(), method, path) &&
      (actorId === undefined || response.request().headers()['x-demo-user-id'] === actorId),
  )
  // A failed UI action can close the page before this awaited response arrives.
  void pending.catch(() => undefined)
  return pending
}

export async function browserJSON<T>(response: Response, status = 200): Promise<T> {
  expect(response.status(), `Browser API expected HTTP ${status}`).toBe(status)
  return response.json() as Promise<T>
}

export async function assertApiMode(page: Page) {
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) {
    // A modal correctly removes the background actor selector from the accessibility tree.
    await expect(dialog).toHaveAccessibleDescription(/Patient workspace\. API mode\./)
  } else {
    await expect(page.getByRole('combobox', { name: 'Select demo user' })).toBeVisible()
  }
  await expect(
    page.getByText('Demo workspace', { exact: false }),
    'LIVE INTEGRATION REQUIRES API MODE: this frontend still presents the in-memory Demo workspace.',
  ).toHaveCount(0)
}

export async function selectActor(page: Page, actor: Actor) {
  const selector = page.getByRole('combobox', { name: 'Select demo user' })
  if ((await selector.textContent())?.trim() !== actor.display_name) {
    await selector.click()
    await page.getByRole('option', { name: actor.display_name, exact: true }).click()
  }
  await expect(selector).toHaveText(actor.display_name)
}

export async function directory(page: Page, api: LiveApi, actor: Actor, path = '/patients') {
  const response = waitForAPI(page, api, 'GET', '/patients', actor.id)
  await page.goto(api.uiURL(path))
  await assertApiMode(page)
  await selectActor(page, actor)
  const result = await browserJSON<PatientPage>(await response)
  await expect(page.locator('.ac-results-status')).not.toContainText(/Loading|Updating/)
  return result
}

export async function openPatient(page: Page, api: LiveApi, id: string, tab = 'overview') {
  await page.goto(api.uiURL(`/patients/${id}?tab=${tab}`))
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`, 'i') })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expectNoOverflow(page)
}

export async function choose(page: Page, control: Locator, option: string) {
  await control.click()
  await page.getByRole('option', { name: option, exact: true }).click()
  // Radix retains its closing portal and document scroll lock until the exit completes.
  await expect(page.getByRole('listbox', { includeHidden: true })).toHaveCount(0)
}

export async function search(page: Page, api: LiveApi, value: string) {
  const response = page.waitForResponse(
    (reply) =>
      apiRequestMatches(api, reply.request(), 'GET', '/patients') &&
      new URL(reply.url()).searchParams.get('q') === value,
  )
  await page.getByRole('searchbox', { name: 'Search patients' }).fill(value)
  const result = await browserJSON<PatientPage>(await response)
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === value)
  await expect(page.locator('.ac-results-status')).not.toContainText(/Loading|Updating/)
  return result
}

export function patientRow(page: Page, id: string) {
  return page.locator(`[data-patient-id="${id}"]`)
}

export async function closeWorkspace(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 768
  if (mobile)
    await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click()
  else await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export async function confirmDeletion(page: Page, label: string) {
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

export async function refreshDiscussion(page: Page, api: LiveApi, patientId: string, actor: Actor) {
  const response = waitForAPI(page, api, 'GET', `/patients/${patientId}/comments`, actor.id)
  await page
    .getByRole('region', { name: 'Team discussion' })
    .getByRole('button', { name: 'Refresh discussion', exact: true })
    .click()
  expect((await response).status()).toBe(200)
}

export async function expectNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    height: window.innerHeight,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1)
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport + 1)
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) {
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(sizes.viewport + 1)
    expect(box!.y).toBeGreaterThanOrEqual(-1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(sizes.height + 1)
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    const close = dialog.getByRole('button', {
      name: sizes.viewport < 768 ? 'Back' : 'Close patient workspace',
      exact: true,
    })
    await expect(close).toBeInViewport({ ratio: 1 })
    const tabs = dialog.getByRole('tablist', { name: 'Patient record sections', exact: true })
    if (await tabs.count()) await expect(tabs).toBeInViewport({ ratio: 1 })
    return { ...sizes, dialog: box, close: await close.boundingBox() }
  }
  return { ...sizes, dialog: null, close: null }
}

export async function expectNotificationBadge(page: Page, api: LiveApi, actor: Actor) {
  const summary = await api.notifications(actor.id)
  const label =
    summary.unread_comments === 0
      ? 'Notifications, no unread comments'
      : `Notifications, ${summary.unread_comments} unread ${summary.unread_comments === 1 ? 'comment' : 'comments'}`
  await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
}

export async function expectAPIError(
  api: LiveApi,
  method: 'POST' | 'PUT' | 'DELETE' | 'GET',
  path: string,
  actorId: string,
  status: number,
  data?: unknown,
) {
  const response = await api.response(method, path, actorId, data)
  await expectStatus(response, status)
  const body = (await response.json()) as { error: { code: string } }
  expect(typeof body.error.code).toBe('string')
  return body.error.code
}

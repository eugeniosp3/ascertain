import { expect, notePath, selectActor, test } from './contract-fixture'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('mobile API search/status/sort serializes exactly and a direct HTTP note opens', async ({
  page,
  contract,
}) => {
  await page.goto('/patients')
  await selectActor(page, contract)
  await expect(page.getByRole('status')).toHaveText('1 patient')
  await page.getByRole('searchbox', { name: 'Search patients' }).fill('00004123')
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === '00004123')
  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await page.getByRole('combobox', { name: 'Sort patients', exact: true }).click()
  await page.getByRole('option', { name: 'Age, oldest first', exact: true }).click()
  await expect
    .poll(() => contract.matching('GET', '/patients').at(-1)?.query)
    .toEqual({
      q: '00004123',
      status: 'active',
      sort_by: 'dob',
      order: 'asc',
      page: '1',
      page_size: '20',
    })
  await expect(
    page.getByRole('link', { name: 'Notifications, 37 unread comments', exact: true }),
  ).toBeVisible()
  await page.goto(notePath)
  await expect(page.getByRole('article')).toContainText('Literal <b>response</b>')
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  expect(contract.matching('GET', notePath).length).toBeGreaterThan(0)
  await expect(page.getByText('Demo workspace', { exact: false })).toHaveCount(0)
})

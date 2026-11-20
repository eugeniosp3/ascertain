import { test, expect } from './fixtures'
import { writeFile } from 'node:fs/promises'
import type { Patient, PatientPage } from './api'
import {
  browserJSON,
  choose,
  closeWorkspace,
  expectNoOverflow,
  patientRow,
  search,
  waitForAPI,
} from './ui'

test('real directory source, search, status, sorting, pagination and scroll restoration', async ({
  page,
  live,
  isMobile,
}, testInfo) => {
  const { api, actors, initialDirectory } = live
  const actor = actors[0]
  await test.step('Baseline rendered identifiers come from the real service without opening a seed record', async () => {
    const baseline = await api.json<PatientPage>(
      'GET',
      '/patients?page=1&page_size=20&sort_by=name&order=asc',
      actor.id,
    )
    expect(initialDirectory.items.map((patient) => patient.id)).toEqual(
      baseline.items.map((patient) => patient.id),
    )
    const source =
      baseline.items.find((patient) => patient.source_patient_id || patient.mrn) ??
      baseline.items[0]
    if (source) {
      const identifier = source.source_patient_id || source.mrn || source.id
      const found = await search(page, api, identifier)
      expect(found.items.some((patient) => patient.id === source.id)).toBe(true)
      await expect(patientRow(page, source.id)).toContainText(identifier)
    }
  })

  // A deterministic private query guarantees two pages even on an otherwise empty database.
  const created: Patient[] = []
  for (let index = 0; index < 21; index++) {
    created.push(
      await api.createPatient(`Directory${String(index).padStart(2, '0')}`, actor.id, {
        status: index === 20 ? 'inactive' : 'active',
      }),
    )
  }
  const ids = new Set(created.map((patient) => patient.id))

  await test.step('Search and status are server queries over this test’s records', async () => {
    const found = await search(page, api, api.token)
    expect(found.total).toBe(created.length)
    expect(found.items.every((patient) => ids.has(patient.id))).toBe(true)
    await expect(page.locator('.ac-results-status')).toHaveText('21 patients matching your filters')
    const filteredResponse = waitForAPI(
      page,
      api,
      'GET',
      `/patients?q=${api.token}&status=inactive`,
      actor.id,
    )
    await page
      .getByRole('group', { name: 'Filter by patient status' })
      .getByRole('button', { name: 'Inactive', exact: true })
      .click()
    const filtered = await browserJSON<PatientPage>(await filteredResponse)
    expect(new URL((await filteredResponse).url()).searchParams.get('status')).toBe('inactive')
    expect(filtered.items.map((patient) => patient.id)).toEqual([created[20]!.id])
    await expect(patientRow(page, created[20]!.id)).toBeVisible()
    await page.getByRole('button', { name: 'All patients', exact: true }).click()
    // Returning to the fresh all-status query may reuse its real HTTP result.
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('q') === api.token &&
        [null, 'all'].includes(url.searchParams.get('status')),
    )
    await expect(page.locator('.ac-results-status')).toHaveText('21 patients matching your filters')
    await expect(patientRow(page, found.items[0]!.id)).toBeVisible()
  })

  await test.step('Sort and Next use actual server parameters and returned UUIDs', async () => {
    const sortedResponse = waitForAPI(
      page,
      api,
      'GET',
      `/patients?q=${api.token}&sort_by=name&order=desc&page=1&page_size=20`,
      actor.id,
    )
    if (isMobile) {
      await choose(page, page.getByRole('combobox', { name: 'Sort patients' }), 'Name, Z–A')
    } else {
      await page.getByRole('button', { name: /^Sort by Patient/ }).click()
    }
    const response = await sortedResponse
    expect(new URL(response.url()).searchParams.get('sort_by')).toBe('name')
    expect(new URL(response.url()).searchParams.get('order')).toBe('desc')
    const sorted = await browserJSON<PatientPage>(response)
    await expect(patientRow(page, sorted.items[0]!.id)).toBeVisible()
    expect(sorted.items[0]!.id).toBe(created[20]!.id)

    const nextResponse = waitForAPI(
      page,
      api,
      'GET',
      `/patients?q=${api.token}&sort_by=name&order=desc&page=2&page_size=20`,
      actor.id,
    )
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    const next = await browserJSON<PatientPage>(await nextResponse)
    expect(next.page).toBe(2)
    expect(next.items.map((patient) => patient.id)).toEqual([created[0]!.id])
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
    await expect(patientRow(page, created[0]!.id)).toBeVisible()

    const sizeResponse = waitForAPI(
      page,
      api,
      'GET',
      `/patients?q=${api.token}&sort_by=name&order=desc&page=1&page_size=50`,
      actor.id,
    )
    await choose(page, page.getByRole('combobox', { name: 'Rows per page' }), '50')
    const enlarged = await browserJSON<PatientPage>(await sizeResponse)
    expect(enlarged.page).toBe(1)
    expect(enlarged.page_size).toBe(50)
    expect(enlarged.items).toHaveLength(21)
    await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible()
  })

  await test.step('Opening a private row preserves its list scroll and keyboard focus', async () => {
    const scroll = page.locator('.ac-list-scroll')
    await expect(scroll).toHaveAttribute('aria-busy', 'false')
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const target = patientRow(page, created[0]!.id)
    const link = target.locator('a[data-open-tab="overview"]')
    await expect(link).toBeVisible()
    await link.focus()
    async function position() {
      return scroll.evaluate((element, id) => {
        const row = element.querySelector<HTMLElement>(`[data-patient-id="${id}"]`)!
        const action = row.querySelector<HTMLElement>('a[data-open-tab="overview"]')!
        const box = (node: Element) => {
          const { x, y, width, height } = node.getBoundingClientRect()
          return { x, y, width, height }
        }
        return {
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          list: box(element),
          row: box(row),
          action: box(action),
          rendered: [...element.querySelectorAll<HTMLElement>('[data-patient-id]')].map((item) => ({
            id: item.dataset.patientId,
            height: item.getBoundingClientRect().height,
          })),
        }
      }, created[0]!.id)
    }
    const beforePosition = await position()
    await link.press('Enter')
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
      'data-state',
      'active',
    )
    await closeWorkspace(page)
    await expect(link).toBeFocused()
    const scrollPath = testInfo.outputPath('scroll-restoration.json')
    await writeFile(
      scrollPath,
      JSON.stringify({ before: beforePosition, after: await position() }, null, 2),
    )
    await testInfo.attach('scroll-restoration', {
      path: scrollPath,
      contentType: 'application/json',
    })
    // Virtual spacer estimates can change across remount without moving the visible card.
    // Preserve both the on-screen anchor and distance from the list's end within two pixels.
    await expect
      .poll(async () => {
        const after = await position()
        return Math.abs(
          after.action.y - after.list.y - (beforePosition.action.y - beforePosition.list.y),
        )
      })
      .toBeLessThanOrEqual(2)
    await expect
      .poll(async () => {
        const after = await position()
        return Math.abs(
          after.scrollHeight -
            after.scrollTop -
            (beforePosition.scrollHeight - beforePosition.scrollTop),
        )
      })
      .toBeLessThanOrEqual(2)
    await expectNoOverflow(page)
  })

  const empty = await search(page, api, `NoMatch-${api.token}`)
  expect(empty.total).toBe(0)
  await expect(
    page.getByRole('heading', { name: 'No matching patients', exact: true }),
  ).toBeVisible()
})

test('plain row/card areas open Overview and child activity links retain their single navigation', async ({
  page,
  live,
  isMobile,
}) => {
  const { api, actors } = live
  const patient = await api.createPatient('OpenAreas', actors[0].id)
  await search(page, api, api.token)
  const row = patientRow(page, patient.id)

  for (const area of ['age', 'status', 'blank'] as const) {
    await test.step(`${area} opens Overview and closing restores the patient link`, async () => {
      if (area === 'age') {
        await row
          .locator(isMobile ? '.ac-card-meta span' : '.ac-col-age')
          .first()
          .click()
      } else if (area === 'status') {
        await row.getByText('Active', { exact: true }).click()
      } else {
        const box = await row.boundingBox()
        expect(box).not.toBeNull()
        await row.click({ position: { x: box!.width - 4, y: 4 } })
      }
      await expect(page.getByRole('dialog')).toHaveCount(1)
      await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
        'data-state',
        'active',
      )
      await closeWorkspace(page)
      await expect(row.locator('a[data-open-tab="overview"]')).toBeFocused()
    })
  }

  for (const [tab, accessible] of [
    ['notes', /^Notes/],
    ['discussion', /^Discussion/],
  ] as const) {
    const action = row.locator(`a[data-open-tab="${tab}"]`)
    await action.focus()
    await action.press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('tab', { name: accessible })).toHaveAttribute(
      'data-state',
      'active',
    )
    // Exactly one browser Back must undo the child action, with no second workspace entry.
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(
      (url) => url.pathname.endsWith('/patients') && url.searchParams.get('q') === api.token,
    )
    await expect(action).toBeFocused()
  }
})

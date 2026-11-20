import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { test, expect } from './fixtures'
import type { Note } from './api'
import { assertApiMode, expectNoOverflow, waitForAPI } from './ui'

test('compiled SPA/proxy serves direct and refreshed patient/note routes without desktop/mobile overflow', async ({
  page,
  live,
}, testInfo) => {
  const {
    api,
    actors: [actor],
  } = live
  const patient = await api.createPatient('DeepRoutes', actor.id, {
    phone: '+1 (212) 555-0199',
    email: `live-long-profile-${api.token}@example.com`,
    conditions: [{ code: 'I10', label: 'Integration clinical context '.repeat(8).trim() }],
  })
  const geometry: { stage: string; metrics: Awaited<ReturnType<typeof expectNoOverflow>> }[] = []
  const geometryPath = testInfo.outputPath('workspace-geometry.json')
  async function measure(stage: string) {
    geometry.push({ stage, metrics: await expectNoOverflow(page) })
    await writeFile(geometryPath, JSON.stringify(geometry, null, 2))
  }
  const note = await api.json<Note>(
    'POST',
    `/patients/${patient.id}/notes`,
    actor.id,
    {
      timestamp: '2020-01-01T00:00:00Z',
      content: `Live deep-route note ${api.token}`,
    },
    201,
  )
  for (const tab of ['overview', 'notes', 'summary', 'discussion'] as const) {
    await page.goto(api.uiURL(`/patients/${patient.id}?tab=${tab}`))
    await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`, 'i') })).toHaveAttribute(
      'data-state',
      'active',
    )
    await measure(`${tab}-direct`)
    const fetched = waitForAPI(page, api, 'GET', `/patients/${patient.id}`, actor.id)
    const document = await page.reload()
    expect(document?.status(), 'Compiled frontend must serve deep-route HTML').toBe(200)
    expect((await fetched).status()).toBe(200)
    await assertApiMode(page)
    await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`, 'i') })).toHaveAttribute(
      'data-state',
      'active',
    )
    await measure(`${tab}-reload`)
  }
  await page.goto(api.uiURL(`/patients/${patient.id}/notes/${note.id}`))
  await expect(page.getByRole('article')).toContainText(note.content)
  const fetchedNote = waitForAPI(
    page,
    api,
    'GET',
    `/patients/${patient.id}/notes/${note.id}`,
    actor.id,
  )
  expect((await page.reload())?.status()).toBe(200)
  expect((await fetchedNote).status()).toBe(200)
  await expect(page.getByRole('article')).toContainText(note.content)
  await measure('note-reload')

  const absentID = randomUUID()
  const missing = waitForAPI(page, api, 'GET', `/patients/${absentID}`, actor.id)
  await page.goto(api.uiURL(`/patients/${absentID}`))
  expect((await missing).status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Patient not found', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Patient not found', exact: true })).toBeVisible()
  await assertApiMode(page)
  await measure('missing-patient-reload')
  await testInfo.attach('workspace-geometry', {
    path: geometryPath,
    contentType: 'application/json',
  })
})

import { test as base, expect, type Response } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import {
  LiveApi,
  outstandingPatients,
  expectStatus,
  type Actor,
  type Patient,
  type PatientPage,
} from './api'
import { apiRequestMatches, directory } from './ui'

interface LiveSession {
  api: LiveApi
  actors: [Actor, Actor]
  initialDirectory: PatientPage
}

export const test = base.extend<{ live: LiveSession }>({
  live: async ({ request, page, baseURL }, use, testInfo) => {
    if (!baseURL)
      throw new Error('PLAYWRIGHT_LIVE_BASE_URL must identify the existing API frontend.')
    const discovery = await request.get(`${baseURL.replace(/\/$/, '')}/api/users`, {
      timeout: 15_000,
      maxRedirects: 0,
    })
    await expectStatus(discovery, 200)
    const users = (await discovery.json()) as Actor[]
    expect(Array.isArray(users), 'GET /api/users must return the real actor array').toBe(true)
    const sorted = [...users].sort((a, b) => a.id.localeCompare(b.id))
    expect(
      new Set(sorted.map((user) => user.id)).size,
      'Live journeys need two distinct API actors',
    ).toBeGreaterThanOrEqual(2)
    const actors: [Actor, Actor] = [sorted[0]!, sorted[1]!]
    const api = new LiveApi(request, baseURL, actors[0].id)
    const pendingCreates: Promise<void>[] = []
    let trackingFailed = false
    // Also track UI POST success if the test fails before its explicit response assertion.
    const trackUI = (response: Response) => {
      if (
        response.status() === 201 &&
        apiRequestMatches(api, response.request(), 'POST', '/patients')
      ) {
        pendingCreates.push(
          response
            .json()
            .then((saved: Patient) => api.trackCreated(saved))
            .catch(() => {
              trackingFailed = true
            }),
        )
      }
    }
    page.on('response', trackUI)
    try {
      const initialDirectory = await directory(page, api, actors[0])
      await use({ api, actors, initialDirectory })
    } finally {
      try {
        // Preserve the failing app screen before closing the browser's active document.
        if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
          const screenshot = await page.screenshot({ timeout: 5_000 }).catch(() => undefined)
          if (screenshot)
            await testInfo.attach('live-failure', { body: screenshot, contentType: 'image/png' })
        }
        await Promise.all(pendingCreates)
      } finally {
        // Closing prevents delayed browser read receipts from racing patient cleanup.
        try {
          await page.close()
        } finally {
          page.off('response', trackUI)
          await Promise.all(pendingCreates)
          try {
            expect(trackingFailed, 'A UI-created patient could not be tracked').toBe(false)
          } finally {
            await api.cleanup()
            const cleanupPath = testInfo.outputPath('live-cleanup.json')
            await writeFile(
              cleanupPath,
              JSON.stringify({
                test: testInfo.title,
                project: testInfo.project.name,
                created_patient_ids: [...api.owned],
                verified_absent: api.owned.size,
              }),
            )
            await testInfo.attach('live-cleanup', {
              path: cleanupPath,
              contentType: 'application/json',
            })
          }
        }
      }
    }
  },
})

test.afterAll(async ({ playwright, baseURL }) => {
  if (outstandingPatients.size === 0) return
  if (!baseURL) throw new Error('Missing base URL for tracked-patient cleanup retry.')
  const request = await playwright.request.newContext()
  const failures: string[] = []
  try {
    for (const [id, actorId] of outstandingPatients) {
      try {
        const api = new LiveApi(request, baseURL, actorId)
        // Reconstitute only an ID already registered after a successful test create.
        api.owned.add(id)
        await api.cleanup()
      } catch {
        failures.push(id)
      }
    }
  } finally {
    await request.dispose()
  }
  expect(failures, 'Final cleanup: these test-created patient UUIDs remain unverified').toEqual([])
})

export { expect } from '@playwright/test'

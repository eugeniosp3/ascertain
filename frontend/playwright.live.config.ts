import { defineConfig, devices } from '@playwright/test'

const supplied = process.env.PLAYWRIGHT_LIVE_BASE_URL?.trim()
if (!supplied) {
  throw new Error(
    'PLAYWRIGHT_LIVE_BASE_URL is required: point it at an already-running compiled API-mode frontend. The live suite starts no servers.',
  )
}

let parsed: URL
try {
  parsed = new URL(supplied)
} catch {
  throw new Error('PLAYWRIGHT_LIVE_BASE_URL must be an absolute HTTP(S) URL.')
}
if (
  !['http:', 'https:'].includes(parsed.protocol) ||
  !parsed.hostname ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash
) {
  throw new Error(
    'PLAYWRIGHT_LIVE_BASE_URL must be an HTTP(S) frontend URL without credentials, query or fragment.',
  )
}

export default defineConfig({
  testDir: './e2e-live',
  outputDir: './e2e-live/results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE || './e2e-live/results/report.json' },
    ],
  ],
  use: {
    baseURL: parsed.href.replace(/\/$/, ''),
    channel: 'chrome',
    timezoneId: 'America/New_York',
    actionTimeout: 15_000,
    navigationTimeout: 25_000,
    trace: 'on',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],
  // Intentionally no webServer: infrastructure owns the existing compiled stack.
})

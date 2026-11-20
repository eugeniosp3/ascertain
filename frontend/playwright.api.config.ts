import { defineConfig, devices } from '@playwright/test'

const externalBaseURL = process.env.PLAYWRIGHT_API_BASE_URL
const localBaseURL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './e2e-api',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  outputDir: './e2e-api/results',
  use: {
    baseURL: externalBaseURL || localBaseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'America/New_York',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
        url: localBaseURL,
        reuseExistingServer: false,
        env: { VITE_DATA_MODE: 'api', VITE_API_BASE: '/api' },
      },
})

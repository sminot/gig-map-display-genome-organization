import { defineConfig, devices } from '@playwright/test';

// Servers (vite dev @5175, FastAPI @8000) are started externally by the
// orchestrator. No webServer block — this suite only drives the running app.
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5175',
    headless: true,
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

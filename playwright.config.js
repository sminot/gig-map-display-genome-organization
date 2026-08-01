import { defineConfig } from '@playwright/test';

const PORT = 8125;

/**
 * The harness is served as static files, the same way the standalone app is
 * deployed — no build step between the source and what the tests exercise.
 *
 * Chromium needs SwiftShader to give headless runs a real WebGL2 context; without
 * it every WebGL assertion here would be skipped rather than checked.
 */
export default defineConfig({
  testDir: './test/browser',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 1200 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/test/browser/harness.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});

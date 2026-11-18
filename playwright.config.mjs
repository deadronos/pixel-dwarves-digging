import { defineConfig } from '@playwright/test'

const origin = 'http://127.0.0.1:4179'

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './output/playwright/test-results',
  use: {
    baseURL: origin,
    browserName: 'chromium',
    viewport: { width: 1000, height: 760 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: origin,
    reuseExistingServer: !process.env.CI,
  },
})

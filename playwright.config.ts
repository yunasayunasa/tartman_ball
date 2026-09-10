import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5177',
    viewport: { width: 390, height: 844 },
    headless: true,
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5177 --strictPort',
      url: 'http://127.0.0.1:5177',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -- --base /sky-tart-roll/ --port 5178 --strictPort',
      url: 'http://127.0.0.1:5178/sky-tart-roll/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

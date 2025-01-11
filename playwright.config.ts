import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  reporter: process.env.CI ? 'junit' : 'list',
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    // url: '/'
  }
});
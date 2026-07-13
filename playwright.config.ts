import { defineConfig } from '@playwright/test';

// The meta-repo (iris-web) brings the full IRIS stack up via docker compose
// and points PLAYWRIGHT_BASE_URL at the nginx TLS endpoint. Locally, when
// running against a dev stack on your machine, set:
//     PLAYWRIGHT_BASE_URL=https://localhost npx playwright test

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost';

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	reporter: process.env.CI
		? [['junit', { outputFile: 'playwright-junit.xml' }], ['github']]
		: 'list',
	use: {
		baseURL,
		headless: true,
		viewport: { width: 1280, height: 720 },
		ignoreHTTPSErrors: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	}
});

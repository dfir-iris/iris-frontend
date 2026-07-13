import { defineConfig, devices } from '@playwright/test';

// The meta-repo (iris-web) brings the full IRIS stack up via docker compose
// and points PLAYWRIGHT_BASE_URL at the nginx TLS endpoint. Locally, when
// running against a dev stack on your machine:
//     PLAYWRIGHT_BASE_URL=https://localhost npx playwright test

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost';

// CI defaults to Chromium + Firefox; local runs default to just Chromium
// for faster iteration.
const projects = process.env.CI
	? [
			{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
			{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }
		]
	: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	fullyParallel: true,
	workers: process.env.CI ? 2 : undefined,
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
	},
	projects
});

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
	// Cap workers to 4 — the SvelteKit SSR node process serialises against
	// the backend on the /login load, and running with the OS-default worker
	// count (~10 on modern laptops) causes intermittent "fetch failed" SSR
	// errors on the login route.
	workers: process.env.CI ? 2 : 4,
	// One retry on failure — swallows the SvelteKit SSR fetch-flakes that
	// happen under load, without hiding real regressions (which fail twice).
	retries: 1,
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

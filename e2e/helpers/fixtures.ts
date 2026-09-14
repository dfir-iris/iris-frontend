import { test as base, expect, type Page } from '@playwright/test';

// Playwright surfaces nothing when the page under test throws: a spec can
// assert its way to green while every render dies in the browser. Nothing in
// this suite listened for that, which is how a hard hydration failure on
// /cases went unnoticed across a full 166-test run.
//
// This wrapper overrides the built-in `page` fixture to record `pageerror`
// events (uncaught exceptions and unhandled promise rejections) and fail the
// test during teardown. Overriding `page` rather than registering an `auto`
// fixture keeps the ~25 API-only specs browser-free — a fixture body only runs
// for tests that actually ask for a page.
//
// A test that legitimately provokes an uncaught error can opt out with:
//   test.info().annotations.push({ type: 'allow-page-errors' });

// Svelte reports a failed hydration through console.warn and then silently
// re-mounts the app, so it reaches neither `pageerror` nor console.error.
// Capture it by name: it means the SSR markup and the client DOM disagree.
const NOTABLE_WARNINGS = [/Failed to hydrate/i];

export const test = base.extend<{ page: Page }>({
	page: async ({ page }, use, testInfo) => {
		const pageErrors: Error[] = [];
		const consoleErrors: string[] = [];

		page.on('pageerror', (error) => pageErrors.push(error));
		page.on('console', (msg) => {
			const type = msg.type();
			const text = msg.text();

			if (
				type === 'error' ||
				(type === 'warning' && NOTABLE_WARNINGS.some((rx) => rx.test(text)))
			) {
				consoleErrors.push(`[${type}] ${text}`);
			}
		});

		await use(page);

		// Console noise is triage context only. It is far too noisy to gate on
		// today, so it is attached to the report and never fails a test.
		if (consoleErrors.length > 0) {
			await testInfo.attach('console-errors.txt', {
				body: consoleErrors.join('\n'),
				contentType: 'text/plain'
			});
		}

		if (pageErrors.length === 0) return;

		const detail = pageErrors
			.map((error, i) => `${i + 1}. ${error.message}\n${error.stack ?? '<no stack>'}`)
			.join('\n\n');

		await testInfo.attach('page-errors.txt', { body: detail, contentType: 'text/plain' });

		if (testInfo.annotations.some((a) => a.type === 'allow-page-errors')) return;

		// Only fail a test that otherwise passed. If the body already failed,
		// that failure is the more useful signal and this would just bury it.
		if (testInfo.status !== testInfo.expectedStatus) return;

		throw new Error(`${pageErrors.length} uncaught page error(s) during this test:\n\n${detail}`);
	}
});

export { expect };

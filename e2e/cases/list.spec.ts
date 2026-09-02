import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

// These assertions track the "Case queue" page (src/routes/(app)/cases/+page.svelte).
// They were previously written against an older "Open Cases" table layout and
// went stale when the page was redesigned into the queue + detail split view.

test.describe('Cases · list', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/cases page loads with the Case queue header and sortable columns', async ({ page }) => {
		await page.goto('/cases');
		await expect(page.getByRole('heading', { name: /^case queue$/i, level: 1 })).toBeVisible({
			timeout: 10_000
		});

		// The column headers are buttons, not <th role="columnheader">. Their
		// accessible name is "Sort by <label>", plus " (ascending)"/" (descending)"
		// on whichever column is currently sorted — hence the prefix match.
		await expect(page.getByRole('button', { name: /^Sort by Case\b/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Sort by Stage\b/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Sort by Owner\b/ })).toBeVisible();
	});

	test('/cases page exposes the "Open a case" create affordance', async ({ page }) => {
		await page.goto('/cases');
		// The create-case action reads "Open a case" (as in "open a new
		// investigation case").
		await expect(page.getByRole('button', { name: /^Open a case$/i })).toBeVisible({
			timeout: 10_000
		});
	});

	test('the queue search box filters the list down to the empty state', async ({ page }) => {
		// Login + first paint + debounce + refetch, each with its own ceiling.
		test.setTimeout(60_000);

		await page.goto('/cases');

		// The search input is a shadcn <Input> with no aria-label, so the
		// placeholder is the only stable handle on it.
		const search = page.getByPlaceholder(/^Filter by title/);
		await expect(search).toBeVisible({ timeout: 10_000 });

		await search.fill('nonexistent-case-name-xyzzy');

		// The box is debounced and then pushes the term into the URL, which is
		// what triggers the refetch. Waiting on the URL is deterministic where
		// waiting on a fixed timeout is not.
		await page.waitForURL(/[?&]search=nonexistent-case-name-xyzzy/, { timeout: 10_000 });

		// Nothing can match, so the queue must fall through to its empty state.
		await expect(page.getByText('No cases match this view.')).toBeVisible({ timeout: 10_000 });
	});
});

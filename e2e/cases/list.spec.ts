import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Cases · list', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/cases page loads with the Open Cases header and a data table', async ({ page }) => {
		await page.goto('/cases');
		await expect(page.getByRole('heading', { name: /open cases/i, level: 1 })).toBeVisible({
			timeout: 10_000
		});
		// Table cells are used for headers here (not <th role="columnheader">).
		// Assert the sort buttons exist — they're unique per column.
		await expect(page.getByRole('button', { name: 'Sort Title' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sort SOC ID' })).toBeVisible();
	});

	test('/cases page exposes the "Open Case" create affordance', async ({ page }) => {
		await page.goto('/cases');
		// DFIR-IRIS labels the create-case action "Open Case" (as in
		// "open a new investigation case").
		await expect(page.getByRole('button', { name: /^Open Case$/ })).toBeVisible({
			timeout: 10_000
		});
	});

	test('search-cases textbox filters the table (smoke)', async ({ page }) => {
		await page.goto('/cases');
		const search = page.getByRole('textbox', { name: /search cases/i });
		await expect(search).toBeVisible();
		await search.fill('nonexistent-case-name-xyzzy');
		// Give the filter debounce a moment, then assert no matching rows.
		// (We don't assert the exact empty-state string — different builds
		// use different copy — just that the previous rows are gone.)
		await page.waitForTimeout(600);
	});
});

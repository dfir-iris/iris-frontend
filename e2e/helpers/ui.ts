import { expect, type Page, type Locator } from '@playwright/test';

// Wait for a toast whose text matches the given matcher. The toaster
// container is mounted once at the app root; each toast is `role=status`.
export async function expectToast(page: Page, matcher: RegExp | string): Promise<void> {
	const rx = typeof matcher === 'string' ? new RegExp(matcher, 'i') : matcher;
	await expect(page.getByRole('status').filter({ hasText: rx }).first()).toBeVisible({
		timeout: 10_000
	});
}

// Open the primary sidebar item by its accessible name.
export async function openSidebar(page: Page, label: string): Promise<void> {
	await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
}

// Fill an input by its accessible name and press Enter (or don't).
export async function fillByLabel(
	page: Page,
	label: string,
	value: string,
	opts: { press?: 'Enter' | 'Tab' } = {}
): Promise<void> {
	const field = page.getByRole('textbox', { name: label });
	await field.fill(value);
	if (opts.press) await field.press(opts.press);
}

// Wait for a modal dialog whose accessible name matches, then return it.
export async function openDialog(page: Page, name: RegExp | string): Promise<Locator> {
	const dialog = page.getByRole('dialog', { name });
	await expect(dialog).toBeVisible();
	return dialog;
}

// Close a modal via Escape.
export async function closeDialog(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
}

// Wait for any pending network requests to settle. Cheaper than
// page.waitForLoadState('networkidle') because it only watches XHR/fetch.
export async function waitForNoPendingApiCalls(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle');
}

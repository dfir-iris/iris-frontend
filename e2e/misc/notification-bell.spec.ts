import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

// The top-bar bell popover.
//
// This lives in Playwright rather than Vitest on purpose: the failure mode it
// guards against is purely geometric. bits-ui resolves a floating layer's
// anchor from the nearest `Floating.Root` *context*, and the bell's trigger is
// rendered inside `<Tooltip>`'s `child` snippet — so without an explicit
// `customAnchor` the popover's own root never learns its trigger node,
// floating-ui gets a null reference and parks the content at
// `translate(0, -200%)`. The markup is present and even `toBeVisible()`
// passes; it is simply off screen above the viewport. Only `toBeInViewport()`
// catches that.

test.describe('Notification bell', () => {
	test('opens a popover that is actually on screen', async ({ page }) => {
		await login(page);
		await page.goto('/');

		const bell = page.getByRole('button', { name: 'Notifications' });
		await expect(bell).toBeVisible();

		// Hover first — that's what a real user does, and it brings the
		// tooltip into play alongside the popover.
		await bell.hover();
		await bell.click();

		const popover = page.locator('[data-bits-floating-content-wrapper]', {
			has: page.getByText('Notifications', { exact: true })
		});
		await expect(popover).toBeVisible();
		await expect(popover).toBeInViewport();

		// Either the empty state or a feed — both are fine; the point is that
		// the panel rendered where the user can see it.
		await expect(page.getByRole('button', { name: 'Mark all read' })).toBeInViewport();
	});
});

import { describe, it, expect } from 'vitest';
import { Permission } from '$lib/services/user-context.service';
import { SETTINGS_PAGE_PERMISSIONS, SETTINGS_PERMISSIONS } from '../settings-pages';

// Keys are paths like `/src/routes/(app)/settings/mail/+page.svelte`. The
// parentheses of the route group are glob syntax, hence the escaping.
const settingsPages = Object.keys(
	import.meta.glob('/src/routes/\\(app\\)/settings/*/+page.svelte')
).map((path) => `/${path.split('/').at(-2)}`);

describe('SETTINGS_PAGE_PERMISSIONS', () => {
	it('gates every settings page', () => {
		// A page missing here is filtered out of the Settings menu for everyone.
		expect(settingsPages.length).toBeGreaterThan(10);
		for (const page of settingsPages) {
			expect(SETTINGS_PAGE_PERMISSIONS, page).toHaveProperty(page);
		}
	});

	it('only references known permissions', () => {
		for (const perm of Object.values(SETTINGS_PAGE_PERMISSIONS)) {
			expect(Permission).toHaveProperty(perm);
		}
	});
});

describe('SETTINGS_PERMISSIONS', () => {
	it('opens Settings to users with a partial admin surface', () => {
		expect(SETTINGS_PERMISSIONS).toContain('case_templates_read');
		expect(SETTINGS_PERMISSIONS).toContain('customers_read');
		expect(SETTINGS_PERMISSIONS).toContain('server_administrator');
	});
});

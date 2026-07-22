import { describe, it, expect } from 'vitest';

import { ENDPOINTS } from '../endpoints';

// Regression guard: several ENDPOINTS.manage.* constants previously pointed
// at legacy v1 paths that no longer exist on the backend (see 2026-07-19
// audit). Pinning the expected v2 values here so a future edit that
// reverts to `/manage/tlp/list`, `/manage/ioc-types/list`, etc. fails
// at CI instead of silently 404-ing at runtime.
describe('ENDPOINTS constants — v2 URL contract', () => {
	it('manage.tlp.list points at the v2 taxonomy route (/manage/tlp), not the legacy /manage/tlp/list', () => {
		expect(ENDPOINTS.manage.tlp.list).toBe('/manage/tlp');
	});

	it('manage.ioc_types.list points at the v2 case-objects sub-route, not the legacy /manage/ioc-types/list', () => {
		expect(ENDPOINTS.manage.ioc_types.list).toBe('/manage/case-objects/ioc-types');
	});

	it('does not carry stale entries that would 404 on v2', () => {
		// asset_types was carrying the same legacy /manage/asset-types/list
		// pattern and had zero consumers — should stay removed.
		expect(ENDPOINTS.manage).not.toHaveProperty('asset_types');
	});
});

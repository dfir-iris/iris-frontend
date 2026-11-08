import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/users.service', () => ({
	UsersService: {
		getMyPreference: vi.fn(),
		setMyPreference: vi.fn()
	}
}));

import { UsersService } from '$lib/services/users.service';
import {
	TIMELINE_DEFAULT_VIEW_PREF_KEY,
	loadTimelineLayout,
	parseTimelineLayout,
	saveTimelineLayout
} from '../timeline-default-view';

describe('parseTimelineLayout', () => {
	it('reads both views', () => {
		expect(parseTimelineLayout('cards')).toBe('cards');
		expect(parseTimelineLayout('search')).toBe('search');
	});

	it('falls back to the cards for anything else', () => {
		expect(parseTimelineLayout(null)).toBe('cards');
		expect(parseTimelineLayout('table')).toBe('cards');
		expect(parseTimelineLayout({ mode: 'search' })).toBe('cards');
	});
});

describe('loadTimelineLayout', () => {
	beforeEach(() => vi.clearAllMocks());

	it('reads the stored view', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({
			ok: true,
			data: { key: TIMELINE_DEFAULT_VIEW_PREF_KEY, value: 'search' }
		} as never);

		expect(await loadTimelineLayout()).toBe('search');
		expect(UsersService.getMyPreference).toHaveBeenCalledWith(TIMELINE_DEFAULT_VIEW_PREF_KEY);
	});

	it('falls back to the cards when the request fails or throws', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({ ok: false, data: null } as never);
		expect(await loadTimelineLayout()).toBe('cards');

		vi.mocked(UsersService.getMyPreference).mockRejectedValue(new Error('offline'));
		expect(await loadTimelineLayout()).toBe('cards');
	});
});

describe('saveTimelineLayout', () => {
	beforeEach(() => vi.clearAllMocks());

	it('stores the view under its key', async () => {
		vi.mocked(UsersService.setMyPreference).mockResolvedValue({ ok: true } as never);

		expect(await saveTimelineLayout('search')).toBe(true);
		expect(UsersService.setMyPreference).toHaveBeenCalledWith(
			TIMELINE_DEFAULT_VIEW_PREF_KEY,
			'search'
		);
	});

	it('reports a failed write without throwing', async () => {
		vi.mocked(UsersService.setMyPreference).mockRejectedValue(new Error('offline'));
		expect(await saveTimelineLayout('cards')).toBe(false);
	});
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/users.service', () => ({
	UsersService: {
		getMyPreference: vi.fn(),
		setMyPreference: vi.fn()
	}
}));

import { UsersService } from '$lib/services/users.service';
import {
	ALERTS_LAYOUT,
	ALERTS_LAYOUT_PREF_KEY,
	loadAlertsLayout,
	parseAlertsLayout,
	sameAlertsLayout,
	saveAlertsLayout
} from '../alerts-layout';

describe('parseAlertsLayout', () => {
	it('falls back to the default layout for anything unusable', () => {
		expect(parseAlertsLayout(null)).toEqual(ALERTS_LAYOUT);
		expect(parseAlertsLayout('list')).toEqual(ALERTS_LAYOUT);
		expect(parseAlertsLayout({})).toEqual(ALERTS_LAYOUT);
	});

	it('reads a complete layout', () => {
		expect(
			parseAlertsLayout({
				view: 'board',
				board_group: 'status',
				per_page: 50,
				expanded: true,
				split_queue_width: 712
			})
		).toEqual({
			view: 'board',
			board_group: 'status',
			per_page: 50,
			expanded: true,
			split_queue_width: 712
		});
	});

	it('falls back field by field, keeping what it can read', () => {
		expect(
			parseAlertsLayout({ view: 'list', board_group: 'nope', per_page: '50', expanded: 'yes' })
		).toEqual({ ...ALERTS_LAYOUT, view: 'list' });
		expect(parseAlertsLayout({ view: 'kanban', per_page: 0 })).toEqual(ALERTS_LAYOUT);
		expect(parseAlertsLayout({ per_page: 12.5 })).toEqual(ALERTS_LAYOUT);
	});

	it('keeps a positive queue width, rounded, and drops anything else', () => {
		expect(parseAlertsLayout({ split_queue_width: 600.4 }).split_queue_width).toBe(600);
		expect(parseAlertsLayout({ split_queue_width: 0 }).split_queue_width).toBeNull();
		expect(parseAlertsLayout({ split_queue_width: '600' }).split_queue_width).toBeNull();
		expect(parseAlertsLayout({ split_queue_width: null }).split_queue_width).toBeNull();
	});
});

describe('sameAlertsLayout', () => {
	it('compares every field', () => {
		expect(sameAlertsLayout(ALERTS_LAYOUT, { ...ALERTS_LAYOUT })).toBe(true);
		expect(sameAlertsLayout(ALERTS_LAYOUT, { ...ALERTS_LAYOUT, view: 'list' })).toBe(false);
		expect(sameAlertsLayout(ALERTS_LAYOUT, { ...ALERTS_LAYOUT, expanded: true })).toBe(false);
		expect(sameAlertsLayout(ALERTS_LAYOUT, { ...ALERTS_LAYOUT, split_queue_width: 500 })).toBe(
			false
		);
	});
});

describe('loadAlertsLayout / saveAlertsLayout', () => {
	beforeEach(() => {
		vi.mocked(UsersService.getMyPreference).mockReset();
		vi.mocked(UsersService.setMyPreference).mockReset();
	});

	it('reads the stored value', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({
			ok: true,
			data: { key: ALERTS_LAYOUT_PREF_KEY, value: { view: 'list' } }
		} as never);

		expect(await loadAlertsLayout()).toEqual({ ...ALERTS_LAYOUT, view: 'list' });
		expect(UsersService.getMyPreference).toHaveBeenCalledWith(ALERTS_LAYOUT_PREF_KEY);
	});

	it('falls back on a failed or throwing lookup', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({ ok: false, data: null } as never);
		expect(await loadAlertsLayout()).toEqual(ALERTS_LAYOUT);

		vi.mocked(UsersService.getMyPreference).mockRejectedValue(new Error('down'));
		expect(await loadAlertsLayout()).toEqual(ALERTS_LAYOUT);
	});

	it('writes only the layout fields', async () => {
		vi.mocked(UsersService.setMyPreference).mockResolvedValue({ ok: true } as never);

		const layout = {
			view: 'list',
			board_group: 'status',
			per_page: 10,
			expanded: true,
			split_queue_width: 560
		} as const;
		expect(await saveAlertsLayout({ ...layout, extra: 1 } as never)).toBe(true);
		expect(UsersService.setMyPreference).toHaveBeenCalledWith(ALERTS_LAYOUT_PREF_KEY, layout);
	});

	it('reports a failed write without throwing', async () => {
		vi.mocked(UsersService.setMyPreference).mockRejectedValue(new Error('down'));
		expect(await saveAlertsLayout(ALERTS_LAYOUT)).toBe(false);
	});
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/users.service', () => ({
	UsersService: {
		getMyPreference: vi.fn(),
		setMyPreference: vi.fn()
	}
}));

import { UsersService } from '$lib/services/users.service';
import type { AlertStatus } from '$lib/services/alert-status.service';
import {
	ALERTS_DEFAULT_VIEW,
	ALERTS_DEFAULT_VIEW_PREF_KEY,
	loadAlertsDefaultView,
	openAlertsCondition,
	parseAlertsDefaultView,
	saveAlertsDefaultView
} from '../alerts-default-view';

const status = (status_id: number, status_name: string): AlertStatus => ({
	status_id,
	status_name
});

const STATUSES = [
	status(1, 'New'),
	status(2, 'Assigned'),
	status(3, 'In progress'),
	status(4, 'Closed'),
	status(5, 'Merged'),
	status(6, 'Escalated'),
	status(7, 'Dismissed')
];

describe('parseAlertsDefaultView', () => {
	it('falls back to the open queue for anything unusable', () => {
		expect(parseAlertsDefaultView(null)).toEqual(ALERTS_DEFAULT_VIEW);
		expect(parseAlertsDefaultView('open')).toEqual(ALERTS_DEFAULT_VIEW);
		expect(parseAlertsDefaultView({})).toEqual(ALERTS_DEFAULT_VIEW);
		expect(parseAlertsDefaultView({ mode: 'whatever' })).toEqual(ALERTS_DEFAULT_VIEW);
	});

	it('reads the built-in modes', () => {
		expect(parseAlertsDefaultView({ mode: 'mine' })).toEqual({ mode: 'mine' });
		expect(parseAlertsDefaultView({ mode: 'unassigned' })).toEqual({ mode: 'unassigned' });
		expect(parseAlertsDefaultView({ mode: 'all' })).toEqual({ mode: 'all' });
	});

	it('keeps a preset id, and drops a preset view that has none', () => {
		expect(parseAlertsDefaultView({ mode: 'preset', filter_id: 12 })).toEqual({
			mode: 'preset',
			filter_id: 12
		});
		expect(parseAlertsDefaultView({ mode: 'preset' })).toEqual(ALERTS_DEFAULT_VIEW);
		expect(parseAlertsDefaultView({ mode: 'preset', filter_id: 'nope' })).toEqual(
			ALERTS_DEFAULT_VIEW
		);
	});
});

describe('openAlertsCondition', () => {
	it('excludes every terminal status, matched case-insensitively by name', () => {
		expect(JSON.parse(openAlertsCondition(STATUSES) as string)).toEqual([
			{ field: 'alert_status_id', operator: 'not_in', value: [4, 5, 6, 7] }
		]);
	});

	it('returns undefined when there is nothing to exclude', () => {
		expect(openAlertsCondition([])).toBeUndefined();
		expect(openAlertsCondition([status(1, 'New')])).toBeUndefined();
	});
});

describe('loadAlertsDefaultView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reads the stored value from the preferences bag', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({
			ok: true,
			status: 200,
			data: { key: ALERTS_DEFAULT_VIEW_PREF_KEY, value: { mode: 'unassigned' } }
		});

		await expect(loadAlertsDefaultView()).resolves.toEqual({ mode: 'unassigned' });
		expect(UsersService.getMyPreference).toHaveBeenCalledWith(ALERTS_DEFAULT_VIEW_PREF_KEY);
	});

	it('falls back to the open queue when the preference has never been set', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({
			ok: true,
			status: 200,
			data: { key: ALERTS_DEFAULT_VIEW_PREF_KEY, value: null }
		});

		await expect(loadAlertsDefaultView()).resolves.toEqual(ALERTS_DEFAULT_VIEW);
	});

	it('falls back to the open queue when the request fails', async () => {
		vi.mocked(UsersService.getMyPreference).mockResolvedValue({
			ok: false,
			status: 500,
			data: null
		});

		await expect(loadAlertsDefaultView()).resolves.toEqual(ALERTS_DEFAULT_VIEW);

		vi.mocked(UsersService.getMyPreference).mockRejectedValue(new Error('offline'));

		await expect(loadAlertsDefaultView()).resolves.toEqual(ALERTS_DEFAULT_VIEW);
	});
});

describe('saveAlertsDefaultView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(UsersService.setMyPreference).mockResolvedValue({
			ok: true,
			status: 200,
			data: { key: ALERTS_DEFAULT_VIEW_PREF_KEY, value: null }
		});
	});

	it('drops a stale preset id when the mode is not a preset', async () => {
		await expect(saveAlertsDefaultView({ mode: 'mine', filter_id: 7 })).resolves.toBe(true);

		expect(UsersService.setMyPreference).toHaveBeenCalledWith(ALERTS_DEFAULT_VIEW_PREF_KEY, {
			mode: 'mine'
		});
	});

	it('keeps the preset id for a preset view', async () => {
		await saveAlertsDefaultView({ mode: 'preset', filter_id: 7 });

		expect(UsersService.setMyPreference).toHaveBeenCalledWith(ALERTS_DEFAULT_VIEW_PREF_KEY, {
			mode: 'preset',
			filter_id: 7
		});
	});

	it('reports a failed write', async () => {
		vi.mocked(UsersService.setMyPreference).mockResolvedValue({
			ok: false,
			status: 500,
			data: null
		});

		await expect(saveAlertsDefaultView({ mode: 'all' })).resolves.toBe(false);
	});
});

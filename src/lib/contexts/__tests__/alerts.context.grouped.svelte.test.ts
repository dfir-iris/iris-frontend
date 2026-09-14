import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/alerts.service', () => ({
	AlertService: {
		listGrouped: vi.fn()
	},
	// Stubbed away: the failure path calls it, but these cases are about
	// what `listGroupedPaginated` returns, not about search expressions.
	// `alerts.service.test.ts` covers the helper itself.
	alertSearchQueryError: () => null
}));

vi.mock('$lib/services/alerts-filters.service', () => ({
	AlertsFiltersService: {}
}));

import { AlertService } from '$lib/services/alerts.service';
import { createAlertsContext } from '../alerts.context.svelte';

const listGrouped = AlertService.listGrouped as unknown as ReturnType<typeof vi.fn>;

const body = (data: unknown, extra: Record<string, unknown> = {}) => ({
	ok: true,
	status: 200,
	error: null,
	data: {
		total: 2,
		total_alerts: 3,
		current_page: 1,
		last_page: 1,
		next_page: null,
		data,
		...extra
	}
});

const context = () => createAlertsContext((a) => a.alert_id);

describe('alerts context — listGroupedPaginated', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('registers the page in byId and list.ids', async () => {
		// Regression: the grouped load path used to bypass this bookkeeping,
		// so `selectedAll` — which resolves to `list.ids` — pointed bulk
		// actions at whatever page had been loaded before it.
		listGrouped.mockResolvedValueOnce(
			body([
				{ kind: 'alert', alert: { alert_id: 1 } },
				{
					kind: 'cluster',
					cluster: { cluster_id: 9 },
					alerts: [{ alert_id: 2 }, { alert_id: 3 }],
					alerts_total: 2,
					alerts_truncated: false
				}
			])
		);

		const alerts = context();
		const result = await alerts.listGroupedPaginated({ page: 1, per_page: 25 });

		expect(alerts.list.ids).toEqual([1, 2, 3]);
		expect(alerts.byId[3]).toMatchObject({ alert_id: 3 });
		expect(result?.page.data.map((a) => a.alert_id)).toEqual([1, 2, 3]);
	});

	it('lists an alert shared by two clusters once in list.ids', async () => {
		listGrouped.mockResolvedValueOnce(
			body([
				{
					kind: 'cluster',
					cluster: { cluster_id: 1 },
					alerts: [{ alert_id: 10 }, { alert_id: 11 }],
					alerts_total: 2,
					alerts_truncated: false
				},
				{
					kind: 'cluster',
					cluster: { cluster_id: 2 },
					alerts: [{ alert_id: 11 }, { alert_id: 12 }],
					alerts_total: 2,
					alerts_truncated: false
				}
			])
		);

		const alerts = context();
		await alerts.listGroupedPaginated();

		expect(alerts.list.ids).toEqual([10, 11, 12]);
	});

	it('separates the unit total from the alert total', async () => {
		listGrouped.mockResolvedValueOnce(
			body([{ kind: 'alert', alert: { alert_id: 1 } }], { total: 7, total_alerts: 42 })
		);

		const alerts = context();
		const result = await alerts.listGroupedPaginated();

		// The pager counts units, the heading counts alerts.
		expect(result?.totalUnits).toBe(7);
		expect(result?.page.total).toBe(42);
	});

	it('returns null on a failed request without clobbering list.ids', async () => {
		listGrouped.mockResolvedValueOnce(body([{ kind: 'alert', alert: { alert_id: 5 } }]));

		const alerts = context();
		await alerts.listGroupedPaginated();

		listGrouped.mockResolvedValueOnce({
			ok: false,
			status: 500,
			error: { message: 'boom' },
			data: null
		});

		expect(await alerts.listGroupedPaginated()).toBeNull();
		expect(alerts.list.ids).toEqual([5]);
	});
});

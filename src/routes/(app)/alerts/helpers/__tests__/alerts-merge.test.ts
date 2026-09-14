import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeAlerts } from '../alerts-merge';
import type { AlertsContext } from '$lib/contexts/alerts.context.svelte';
import type { CasesContext } from '$lib/contexts/cases.context.svelte';
import type { MergeAlertPayload } from '../../components/alerts-merge-dialog.svelte';

const alertFixture = (id: number) => ({
	alert_id: id,
	iocs: [{ ioc_id: id * 10 }],
	assets: [{ asset_id: id * 100 }]
});

const payloadFor = (targetCaseId: number | null): MergeAlertPayload =>
	({
		target_case_id: targetCaseId,
		case_template_id: null,
		case_title: 'Escalated case',
		case_tags: 'tag',
		note: 'note',
		import_as_event: false
	}) as MergeAlertPayload;

let alerts: {
	get: ReturnType<typeof vi.fn>;
	merge: ReturnType<typeof vi.fn>;
	escalate: ReturnType<typeof vi.fn>;
	refresh: ReturnType<typeof vi.fn>;
};
let cases: { refresh: ReturnType<typeof vi.fn> };

const deps = () => ({
	alerts: alerts as unknown as AlertsContext,
	cases: cases as unknown as CasesContext
});

beforeEach(() => {
	alerts = {
		get: vi.fn(async (id: number) => alertFixture(id)),
		merge: vi.fn(async () => ({ case_id: 7 })),
		escalate: vi.fn(async () => ({ case_id: 42 })),
		refresh: vi.fn(async () => undefined)
	};
	cases = { refresh: vi.fn(async () => undefined) };
});

describe('mergeAlerts into an existing case', () => {
	it('merges every alert and reports no failures', async () => {
		const result = await mergeAlerts(deps(), [1, 2, 3], payloadFor(7));

		expect(result).toEqual({ caseId: 7, merged: [1, 2, 3], failed: [] });
		expect(alerts.merge).toHaveBeenCalledTimes(3);
	});

	it('forwards the alert IOCs and assets as import lists', async () => {
		await mergeAlerts(deps(), [1], payloadFor(7));

		expect(alerts.merge).toHaveBeenCalledWith(1, {
			target_case_id: 7,
			note: 'note',
			import_as_event: false,
			iocs_import_list: ['10'],
			assets_import_list: ['100']
		});
	});

	it('keeps going after a failure and reports which alerts did not merge', async () => {
		alerts.merge.mockImplementation(async (id: number) => (id === 2 ? null : { case_id: 7 }));

		const result = await mergeAlerts(deps(), [1, 2, 3], payloadFor(7));

		expect(result.merged).toEqual([1, 3]);
		expect(result.failed).toEqual([2]);
		expect(alerts.merge).toHaveBeenCalledTimes(3);
	});

	it('reports an alert that could not be fetched as failed', async () => {
		alerts.get.mockImplementation(async (id: number) => (id === 2 ? null : alertFixture(id)));

		const result = await mergeAlerts(deps(), [1, 2, 3], payloadFor(7));

		expect(result.merged).toEqual([1, 3]);
		expect(result.failed).toEqual([2]);
	});

	it('refreshes cases and alerts exactly once when something merged', async () => {
		await mergeAlerts(deps(), [1, 2, 3], payloadFor(7));

		expect(cases.refresh).toHaveBeenCalledTimes(1);
		expect(alerts.refresh).toHaveBeenCalledTimes(1);
	});

	it('does not refresh when nothing merged', async () => {
		alerts.merge.mockResolvedValue(null);

		const result = await mergeAlerts(deps(), [1, 2], payloadFor(7));

		expect(result.merged).toEqual([]);
		expect(result.failed).toEqual([1, 2]);
		expect(cases.refresh).not.toHaveBeenCalled();
		expect(alerts.refresh).not.toHaveBeenCalled();
	});
});

describe('mergeAlerts escalating to a new case', () => {
	it('escalates the first alert and merges the rest into the created case', async () => {
		const result = await mergeAlerts(deps(), [1, 2, 3], payloadFor(null));

		expect(result).toEqual({ caseId: 42, merged: [1, 2, 3], failed: [] });
		expect(alerts.escalate).toHaveBeenCalledTimes(1);
		expect(alerts.merge).toHaveBeenCalledTimes(2);
		expect(alerts.merge).toHaveBeenCalledWith(2, expect.objectContaining({ target_case_id: 42 }));
	});

	it('retries escalation on the next alert when the first one fails', async () => {
		alerts.escalate.mockImplementationOnce(async () => null);

		const result = await mergeAlerts(deps(), [1, 2], payloadFor(null));

		expect(result.caseId).toBe(42);
		expect(result.failed).toEqual([1]);
		expect(result.merged).toEqual([2]);
		expect(alerts.escalate).toHaveBeenCalledTimes(2);
	});

	it('reports every alert as failed when no case could be created', async () => {
		alerts.escalate.mockResolvedValue(null);

		const result = await mergeAlerts(deps(), [1, 2], payloadFor(null));

		expect(result).toEqual({ caseId: null, merged: [], failed: [1, 2] });
		expect(alerts.merge).not.toHaveBeenCalled();
	});
});

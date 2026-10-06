import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupImportableObservables, mergeAlerts } from '../alerts-merge';
import type { Alert } from '$lib/types/resources/alert';
import type { AlertsContext } from '$lib/contexts/alerts.context.svelte';
import type { CasesContext } from '$lib/contexts/cases.context.svelte';
import type { MergeAlertPayload } from '../../components/alerts-merge-dialog.svelte';

const alertFixture = (id: number) => ({
	alert_id: id,
	iocs: [{ ioc_id: id * 10, ioc_uuid: `ioc-uuid-${id}` }],
	assets: [{ asset_id: id * 100, asset_uuid: `asset-uuid-${id}` }]
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

	it('forwards the alert IOC and asset UUIDs as import lists', async () => {
		await mergeAlerts(deps(), [1], payloadFor(7));

		expect(alerts.merge).toHaveBeenCalledWith(1, {
			target_case_id: 7,
			note: 'note',
			import_as_event: false,
			iocs_import_list: ['ioc-uuid-1'],
			assets_import_list: ['asset-uuid-1']
		});
	});

	it('only forwards the IOCs and assets selected in the dialog', async () => {
		alerts.get.mockImplementation(async (id: number) => ({
			alert_id: id,
			iocs: [{ ioc_uuid: 'ioc-a' }, { ioc_uuid: 'ioc-b' }],
			assets: [{ asset_uuid: 'asset-a' }, { asset_uuid: 'asset-b' }]
		}));

		await mergeAlerts(deps(), [1], {
			...payloadFor(7),
			iocs_import_list: ['ioc-b', 'ioc-from-another-alert'],
			assets_import_list: []
		});

		expect(alerts.merge).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ iocs_import_list: ['ioc-b'], assets_import_list: [] })
		);
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

	it('forwards the alert IOC and asset UUIDs as import lists', async () => {
		await mergeAlerts(deps(), [1], payloadFor(null));

		expect(alerts.escalate).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				iocs_import_list: ['ioc-uuid-1'],
				assets_import_list: ['asset-uuid-1']
			})
		);
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

describe('groupImportableObservables', () => {
	const ioc = (uuid: string, value: string, typeId = 1) => ({
		ioc_uuid: uuid,
		ioc_value: value,
		ioc_type_id: typeId,
		ioc_type: { type_name: `type-${typeId}` }
	});
	const asset = (uuid: string, name: string, typeId = 1) => ({
		asset_uuid: uuid,
		asset_name: name,
		asset_type_id: typeId,
		asset_type: { asset_name: 'Windows - Computer' },
		asset_ip: '10.0.0.1'
	});
	const alertWith = (iocs: unknown[], assets: unknown[]) =>
		({ iocs, assets }) as unknown as Pick<Alert, 'iocs' | 'assets'>;

	it('collapses the same IOC/asset seen on several alerts into one row', () => {
		const groups = groupImportableObservables([
			alertWith([ioc('i1', 'evil.com')], [asset('a1', 'HOST-1')]),
			alertWith([ioc('i2', 'evil.com'), ioc('i3', '1.2.3.4')], [asset('a2', 'HOST-1')])
		]);

		expect(groups.iocs).toEqual([
			{ key: '1|evil.com', label: 'evil.com', detail: 'type-1', uuids: ['i1', 'i2'] },
			{ key: '1|1.2.3.4', label: '1.2.3.4', detail: 'type-1', uuids: ['i3'] }
		]);
		expect(groups.assets).toEqual([
			{
				key: '1|HOST-1',
				label: 'HOST-1',
				detail: 'Windows - Computer · 10.0.0.1',
				uuids: ['a1', 'a2']
			}
		]);
	});

	it('keeps same value with a different type as separate rows', () => {
		const groups = groupImportableObservables([
			alertWith([ioc('i1', 'x', 1), ioc('i2', 'x', 2)], [])
		]);

		expect(groups.iocs.map((g) => g.key)).toEqual(['1|x', '2|x']);
	});
});

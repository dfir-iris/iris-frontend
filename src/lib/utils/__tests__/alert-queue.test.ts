import { describe, expect, it } from 'vitest';
import type { Alert } from '$lib/types/resources/alert';
import type { AlertCluster } from '$lib/types/resources/alert-cluster';
import type { AlertQueueUnit } from '$lib/types/resources/alert-queue-unit';
import {
	clusterSelectionState,
	flattenAlertQueueUnits,
	parseAlertQueueUnits,
	pruneAlertQueueUnits,
	replaceAlertInQueueUnits
} from '../alert-queue';

const alert = (alert_id: number): Alert => ({ alert_id }) as Alert;
const cluster = (cluster_id: number): AlertCluster =>
	({ cluster_id, cluster_title: `Cluster ${cluster_id}` }) as AlertCluster;

const clusterUnit = (id: number, ids: number[]): AlertQueueUnit => ({
	kind: 'cluster',
	cluster: cluster(id),
	alerts: ids.map(alert),
	alerts_total: ids.length,
	alerts_truncated: false
});

const alertUnit = (id: number): AlertQueueUnit => ({ kind: 'alert', alert: alert(id) });

describe('parseAlertQueueUnits', () => {
	it('returns an empty list for anything that is not an array', () => {
		expect(parseAlertQueueUnits(null)).toEqual([]);
		expect(parseAlertQueueUnits(undefined)).toEqual([]);
		expect(parseAlertQueueUnits({ data: [] })).toEqual([]);
	});

	it('reads both unit kinds', () => {
		const units = parseAlertQueueUnits([
			{ kind: 'alert', alert: { alert_id: 1 } },
			{
				kind: 'cluster',
				cluster: { cluster_id: 9 },
				alerts: [{ alert_id: 2 }],
				alerts_total: 5,
				alerts_truncated: true
			}
		]);

		expect(units).toHaveLength(2);
		expect(units[0]).toMatchObject({ kind: 'alert' });
		expect(units[1]).toMatchObject({ kind: 'cluster', alerts_total: 5, alerts_truncated: true });
	});

	it('drops malformed rows instead of throwing', () => {
		// A queue that shows fewer alerts is recoverable; one that crashes
		// on render is not.
		const units = parseAlertQueueUnits([
			null,
			'nope',
			{ kind: 'alert' },
			{ kind: 'cluster', alerts: [] },
			{ kind: 'something-else' },
			{ kind: 'alert', alert: { alert_id: 3 } }
		]);

		expect(units).toEqual([{ kind: 'alert', alert: { alert_id: 3 } }]);
	});

	it('falls back to the delivered member count when alerts_total is missing', () => {
		const units = parseAlertQueueUnits([
			{ kind: 'cluster', cluster: { cluster_id: 1 }, alerts: [{ alert_id: 1 }, { alert_id: 2 }] }
		]);

		expect(units[0]).toMatchObject({ alerts_total: 2, alerts_truncated: false });
	});
});

describe('flattenAlertQueueUnits', () => {
	it('walks units in order, expanding clusters in place', () => {
		const flat = flattenAlertQueueUnits([alertUnit(1), clusterUnit(7, [2, 3]), alertUnit(4)]);

		expect(flat.map((a) => a.alert_id)).toEqual([1, 2, 3, 4]);
	});

	it('lists an alert shared by two clusters only once', () => {
		// It is rendered under both clusters, but j/k must not visit it
		// twice and `x` must not toggle its own selection back off.
		const flat = flattenAlertQueueUnits([clusterUnit(1, [10, 11]), clusterUnit(2, [11, 12])]);

		expect(flat.map((a) => a.alert_id)).toEqual([10, 11, 12]);
	});

	it('skips the members of a collapsed cluster', () => {
		const units = [alertUnit(1), clusterUnit(7, [2, 3])];

		const flat = flattenAlertQueueUnits(units, (id) => id !== 7);

		expect(flat.map((a) => a.alert_id)).toEqual([1]);
	});

	it('defaults to treating every cluster as expanded', () => {
		expect(flattenAlertQueueUnits([clusterUnit(7, [2])])).toHaveLength(1);
	});

	it('handles an empty page', () => {
		expect(flattenAlertQueueUnits([])).toEqual([]);
	});
});

describe('clusterSelectionState', () => {
	const members = [alert(1), alert(2), alert(3)];

	it('is none when nothing in the cluster is picked', () => {
		expect(clusterSelectionState(members, {})).toBe('none');
		expect(clusterSelectionState(members, { 1: false, 9: true })).toBe('none');
	});

	it('is some when only part of the cluster is picked', () => {
		// The state a plain checkbox cannot show, and the one that stops the
		// bulk bar reading as "the whole cluster".
		expect(clusterSelectionState(members, { 2: true })).toBe('some');
		expect(clusterSelectionState(members, { 1: true, 2: true })).toBe('some');
	});

	it('is all only when every member is picked', () => {
		expect(clusterSelectionState(members, { 1: true, 2: true, 3: true })).toBe('all');
	});

	it('ignores selections outside the cluster', () => {
		expect(clusterSelectionState(members, { 1: true, 2: true, 3: true, 99: true })).toBe('all');
	});

	it('treats a cluster with no visible members as none, not all', () => {
		// `every` on an empty list is vacuously true; that would tick the
		// box on a truncated cluster whose members were all deleted.
		expect(clusterSelectionState([], {})).toBe('none');
	});
});

describe('replaceAlertInQueueUnits', () => {
	const updated = { alert_id: 11, alert_title: 'after' } as Alert;

	it('replaces a lone alert in place', () => {
		// Regression: updating an alert from the split view used to patch the
		// flat page only, so the queue row kept showing the old status.
		const units = replaceAlertInQueueUnits([alertUnit(10), alertUnit(11)], updated);

		expect(units[1]).toEqual({ kind: 'alert', alert: updated });
	});

	it('replaces every copy of an alert shared by two clusters', () => {
		const units = replaceAlertInQueueUnits(
			[clusterUnit(1, [10, 11]), clusterUnit(2, [11])],
			updated
		);

		for (const unit of units) {
			if (unit.kind !== 'cluster') continue;
			for (const alert of unit.alerts) {
				if (alert.alert_id === 11) expect(alert).toBe(updated);
			}
		}
	});

	it('returns the same array when the alert is not on the page', () => {
		// Identity matters: a new array would re-render the whole queue.
		const page = [alertUnit(10), clusterUnit(1, [12])];

		expect(replaceAlertInQueueUnits(page, updated)).toBe(page);
	});
});

describe('pruneAlertQueueUnits', () => {
	it('removes deleted lone alerts and counts them as gone units', () => {
		// Regression: deleting from the split view used to prune the flat
		// page only, leaving the deleted row on screen until a reload.
		const { units, removedUnits } = pruneAlertQueueUnits(
			[alertUnit(1), alertUnit(2), alertUnit(3)],
			new Set([2])
		);

		expect(units.map((u) => (u.kind === 'alert' ? u.alert.alert_id : null))).toEqual([1, 3]);
		expect(removedUnits).toBe(1);
	});

	it('removes deleted members from a cluster and brings its count down', () => {
		const { units, removedUnits } = pruneAlertQueueUnits([clusterUnit(7, [1, 2, 3])], new Set([2]));

		expect(units[0]).toMatchObject({ kind: 'cluster', alerts_total: 2 });
		expect(units[0].kind === 'cluster' && units[0].alerts.map((a) => a.alert_id)).toEqual([1, 3]);
		expect(removedUnits).toBe(0);
	});

	it('drops a cluster once its last member is deleted', () => {
		const { units, removedUnits } = pruneAlertQueueUnits(
			[clusterUnit(7, [1, 2]), alertUnit(3)],
			new Set([1, 2])
		);

		expect(units).toHaveLength(1);
		expect(removedUnits).toBe(1);
	});

	it('keeps a truncated cluster whose visible members were all deleted', () => {
		// The server only sent the first page of members, so the cluster is
		// not empty just because everything we can see is gone.
		const truncated: AlertQueueUnit = {
			kind: 'cluster',
			cluster: cluster(7),
			alerts: [alert(1)],
			alerts_total: 60,
			alerts_truncated: true
		};

		const { units, removedUnits } = pruneAlertQueueUnits([truncated], new Set([1]));

		expect(units).toHaveLength(1);
		expect(units[0]).toMatchObject({ alerts_total: 59, alerts_truncated: true });
		expect(removedUnits).toBe(0);
	});

	it('never reports fewer members than it still holds', () => {
		const understated: AlertQueueUnit = {
			kind: 'cluster',
			cluster: cluster(7),
			alerts: [alert(1), alert(2)],
			alerts_total: 1,
			alerts_truncated: false
		};

		const { units } = pruneAlertQueueUnits([understated], new Set([2]));

		expect(units[0]).toMatchObject({ alerts_total: 1 });
	});

	it('leaves the page alone when nothing was deleted', () => {
		const page = [alertUnit(1), clusterUnit(7, [2, 3])];

		const { units, removedUnits } = pruneAlertQueueUnits(page, new Set());

		expect(units).toHaveLength(2);
		expect(removedUnits).toBe(0);
	});
});

/**
 * Helpers for the cluster-grouped triage queue.
 *
 * `GET /api/v2/alerts/grouped` returns queue *units*: a cluster that holds
 * matching alerts, or a matching alert that is in no cluster. The split
 * view renders units, but almost everything else it does — keyboard
 * navigation, focus, select-all — wants a flat list of alerts. These
 * functions are the bridge, kept out of the component so they can be
 * tested without rendering it.
 */
import type { Alert } from '$lib/types/resources/alert';
import type { AlertCluster } from '$lib/types/resources/alert-cluster';
import type { AlertQueueUnit } from '$lib/types/resources/alert-queue-unit';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object';

/**
 * Coerce an untrusted `data` array into units, dropping anything that
 * doesn't look like one. The queue must not blow up on a malformed row
 * from an older backend, it should just show fewer alerts.
 */
export const parseAlertQueueUnits = (raw: unknown): AlertQueueUnit[] => {
	if (!Array.isArray(raw)) return [];

	const units: AlertQueueUnit[] = [];

	for (const entry of raw) {
		if (!isRecord(entry)) continue;

		if (entry.kind === 'cluster') {
			if (!isRecord(entry.cluster)) continue;

			const alerts = Array.isArray(entry.alerts) ? (entry.alerts as Alert[]) : [];

			units.push({
				kind: 'cluster',
				cluster: entry.cluster as unknown as AlertCluster,
				alerts,
				// Fall back to what we were actually sent rather than 0, so a
				// backend that omits the count still shows a truthful badge.
				alerts_total: typeof entry.alerts_total === 'number' ? entry.alerts_total : alerts.length,
				alerts_truncated: entry.alerts_truncated === true
			});
			continue;
		}

		if (entry.kind === 'alert' && isRecord(entry.alert)) {
			units.push({ kind: 'alert', alert: entry.alert as unknown as Alert });
		}
	}

	return units;
};

/**
 * How much of a cluster is currently selected.
 *
 * `'some'` is the state a plain checked/unchecked checkbox cannot express,
 * and the one that matters: a half-selected cluster must not look like a
 * fully-selected one when the bulk bar is about to close six alerts.
 *
 * Note this only sees the members the server shipped. For a truncated
 * cluster `'all'` means "all the ones on screen", which is why the queue
 * also offers a way into the cluster itself.
 */
export const clusterSelectionState = (
	members: Alert[],
	selected: Record<number, boolean>
): 'none' | 'some' | 'all' => {
	if (members.length === 0) return 'none';

	let picked = 0;
	for (const member of members) if (selected[member.alert_id] === true) picked += 1;

	if (picked === 0) return 'none';
	return picked === members.length ? 'all' : 'some';
};

/**
 * Swap in a freshly-updated alert wherever the page shows it.
 *
 * An alert can sit under more than one cluster, so this replaces every copy,
 * not the first one. Returns the original array when there was nothing to
 * replace, so a no-op cannot trigger a re-render.
 */
export const replaceAlertInQueueUnits = (
	units: AlertQueueUnit[],
	updated: Alert
): AlertQueueUnit[] => {
	let changed = false;

	const next = units.map((unit): AlertQueueUnit => {
		if (unit.kind === 'alert') {
			if (unit.alert.alert_id !== updated.alert_id) return unit;
			changed = true;
			return { kind: 'alert', alert: updated };
		}

		if (!unit.alerts.some((alert) => alert.alert_id === updated.alert_id)) return unit;

		changed = true;
		return {
			...unit,
			alerts: unit.alerts.map((alert) => (alert.alert_id === updated.alert_id ? updated : alert))
		};
	});

	return changed ? next : units;
};

/**
 * Drop alerts that no longer exist from an already-rendered page.
 *
 * A cluster whose last visible member goes away disappears with it, and
 * `removedUnits` says how many units that was so the pager's total can be
 * corrected without a refetch. A cluster that still has members keeps its
 * row, but its counts come down too — a badge that keeps claiming "12" after
 * three of them were deleted is worse than a slightly stale page.
 *
 * `alerts_truncated` is deliberately left alone: the server capped the
 * member list, and deleting a member we can see tells us nothing about
 * whether members we cannot see are still there.
 */
export const pruneAlertQueueUnits = (
	units: AlertQueueUnit[],
	removed: Set<number>
): { units: AlertQueueUnit[]; removedUnits: number } => {
	const kept: AlertQueueUnit[] = [];

	for (const unit of units) {
		if (unit.kind === 'alert') {
			if (!removed.has(unit.alert.alert_id)) kept.push(unit);
			continue;
		}

		const alerts = unit.alerts.filter((alert) => !removed.has(alert.alert_id));

		// Emptying a truncated cluster does not empty the cluster — the
		// server only ever sent us the first page of its members, and the
		// rest are still there behind "show all".
		if (alerts.length === 0 && !unit.alerts_truncated) continue;

		const gone = unit.alerts.length - alerts.length;

		kept.push({
			...unit,
			alerts,
			alerts_total: Math.max(alerts.length, unit.alerts_total - gone)
		});
	}

	return { units: kept, removedUnits: units.length - kept.length };
};

/**
 * Every alert on the page, in display order, each one once.
 *
 * `isExpanded` decides whether a cluster's members count as on screen;
 * pass `() => true` to get the whole page regardless of the expand/collapse
 * state (which is what bulk selection wants).
 *
 * The de-duplication matters: an alert belonging to two clusters is
 * *rendered* under each of them, but appearing twice in the navigation
 * order would make `j` stutter and `x` toggle its own selection back off.
 */
export const flattenAlertQueueUnits = (
	units: AlertQueueUnit[],
	isExpanded: (clusterId: number) => boolean = () => true
): Alert[] => {
	const flat: Alert[] = [];
	const seen = new Set<number>();

	const push = (alert: Alert | undefined) => {
		if (!alert || seen.has(alert.alert_id)) return;
		seen.add(alert.alert_id);
		flat.push(alert);
	};

	for (const unit of units) {
		if (unit.kind === 'alert') {
			push(unit.alert);
			continue;
		}

		if (!isExpanded(unit.cluster.cluster_id)) continue;

		for (const alert of unit.alerts) push(alert);
	}

	return flat;
};

import type { Alert } from '$lib/types/resources/alert';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';
import type { AlertStatus } from '$lib/services/alert-status.service';
import { getClosedAlertStatusId } from './alert-status';

type CloseAlertsDeps = {
	updateAlert: (alertId: AlertIdentifier, changes: UpdateAlertBody) => Promise<Alert | null>;
};

/** All closing needs of an alert: its id, and whatever tags it already carries. */
export type ClosableAlert = { alert_id: number; alert_tags?: string | null };

const splitTags = (value: string | null | undefined): string[] =>
	(value ?? '')
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);

/**
 * What to send as `alert_tags` when closing one alert — `undefined` meaning
 * "leave the key out", which is not the same as clearing them.
 *
 * The v2 alert update loads with `partial=True`: absent keys are left alone,
 * present ones overwrite. The close dialog used to send `alert_tags: ''`
 * whenever its box was empty, and an empty box was all it ever had because
 * nothing seeded it — so closing an alert wiped every tag it carried.
 *
 * `replace` is for closing a single alert: the dialog seeds its box with that
 * alert's tags, so the box holds the full intended set and deleting a tag
 * there deletes it here. `append` is for closing several at once, where there
 * is no single set to seed with — the box starts empty and whatever is typed
 * is added to each alert rather than flattening them all to the same tags.
 */
export const resolveCloseTags = (
	existing: string | null | undefined,
	entered: string | null | undefined,
	mode: 'replace' | 'append'
): string | undefined => {
	const typed = splitTags(entered);

	if (mode === 'append') {
		if (typed.length === 0) return undefined;

		const merged = splitTags(existing);
		for (const tag of typed) {
			if (!merged.includes(tag)) merged.push(tag);
		}

		return merged.join(',');
	}

	// Emptying a seeded box is a deliberate "drop them". Emptying a box that
	// was already empty says nothing, so the key stays out of the payload.
	if (typed.length === 0) return splitTags(existing).length > 0 ? '' : undefined;

	return typed.join(',');
};

export const closeAlerts = async (
	{ updateAlert }: CloseAlertsDeps,
	alerts: ClosableAlert[],
	alertStatuses: AlertStatus[],
	changes: UpdateAlertBody
) => {
	const closedStatusId = getClosedAlertStatusId(alertStatuses);
	const mode = alerts.length === 1 ? 'replace' : 'append';

	// Pulled out of the spread below: the payload's tags are per-alert, so
	// the dialog's raw value must not reach `updateAlert` untouched.
	const { alert_tags: entered, ...rest } = changes;

	return await Promise.all(
		alerts.map((alert) => {
			const alert_tags = resolveCloseTags(alert.alert_tags, entered, mode);

			return updateAlert(alert.alert_id, {
				...rest,
				alert_status_id: closedStatusId,
				alert_resolution_status_id: changes.alert_resolution_status_id,
				alert_note: changes.alert_note,
				...(alert_tags === undefined ? {} : { alert_tags })
			});
		})
	);
};

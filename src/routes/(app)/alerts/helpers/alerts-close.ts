import type { Alert } from '$lib/types/resources/alert';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';
import type { AlertStatus } from '$lib/services/alert-status.service';
import { getClosedAlertStatusId } from './alert-status';

type CloseAlertsDeps = {
	updateAlert: (alertId: AlertIdentifier, changes: UpdateAlertBody) => Promise<Alert | null>;
};

export const closeAlerts = async (
	{ updateAlert }: CloseAlertsDeps,
	alertIds: AlertIdentifier[],
	alertStatuses: AlertStatus[],
	changes: UpdateAlertBody
) => {
	const closedStatusId = getClosedAlertStatusId(alertStatuses);

	return await Promise.all(
		alertIds.map((alertId) =>
			updateAlert(alertId, {
				...changes,
				alert_status_id: closedStatusId,
				alert_resolution_status_id: changes.alert_resolution_status_id,
				alert_note: changes.alert_note,
				alert_tags: changes.alert_tags
			})
		)
	);
};
